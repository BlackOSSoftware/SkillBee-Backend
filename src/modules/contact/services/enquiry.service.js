import crypto from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { SUPPORT_STATUS } from '../../../config/security.js';
import { ContactEnquiry } from '../../../models/ContactEnquiry.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { notify } from './notify.service.js';

function cleanText(value, max) {
  return sanitizeHtml(String(value || ''), { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, max);
}

function generateReference() {
  return `ENQ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function createWithReferenceRetry(payload) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await ContactEnquiry.create({ ...payload, referenceNumber: generateReference() });
    } catch (err) {
      if (err?.code === 11000 && attempt < 2) continue; // reference collision — retry
      throw err;
    }
  }
  throw new AppError('Could not allocate enquiry reference', 500, 'REFERENCE_ALLOCATION_FAILED');
}

async function getEnquiryOrThrow(id, { includeDeleted = false } = {}) {
  const filter = { _id: id };
  if (!includeDeleted) filter.deletedAt = null;
  const enquiry = await ContactEnquiry.findOne(filter);
  if (!enquiry) throw new AppError('Enquiry not found', 404, 'ENQUIRY_NOT_FOUND');
  return enquiry;
}

function applyStatusTimestamps(enquiry, status) {
  const now = new Date();
  if (status === SUPPORT_STATUS.REVIEWED) enquiry.reviewedAt = enquiry.reviewedAt || now;
  if (status === SUPPORT_STATUS.RESOLVED) {
    enquiry.resolvedAt = now;
    enquiry.closedAt = null;
  } else if (enquiry.resolvedAt && status !== SUPPORT_STATUS.RESOLVED) {
    enquiry.resolvedAt = null;
  }
  if (status === SUPPORT_STATUS.CLOSED) {
    enquiry.closedAt = now;
    enquiry.resolvedAt = enquiry.resolvedAt || now;
  } else if (enquiry.closedAt && status !== SUPPORT_STATUS.CLOSED) {
    enquiry.closedAt = null;
  }
}

export async function createEnquiry(input) {
  const enquiry = await createWithReferenceRetry({
    name: cleanText(input.name, 120),
    email: cleanText(input.email, 254).toLowerCase(),
    phone: cleanText(input.phone || '', 30),
    subject: cleanText(input.subject, 200),
    message: cleanText(input.message, 10000),
    category: input.category || 'general',
    status: SUPPORT_STATUS.OPEN,
    statusHistory: [{ from: null, to: SUPPORT_STATUS.OPEN, actorId: null, at: new Date() }],
    lastActivityAt: new Date(),
  });

  // Acknowledgement email — simulated when SMTP is unavailable, never blocks creation.
  await notify({
    to: enquiry.email,
    subject: `We Have Received Your Enquiry — ${enquiry.referenceNumber}`,
    template: 'contact_enquiry_received',
    idempotencyKey: `enquiry-ack:${enquiry._id}`,
    meta: {
      studentName: enquiry.name,
      enquiryNumber: enquiry.referenceNumber,
      title: enquiry.subject,
      message: `Reference Number: ${enquiry.referenceNumber}\nSubject: ${enquiry.subject}\n\nOur team will review your enquiry and get back to you soon.`,
    },
  });

  return enquiry.toSafeObject();
}

export async function listAdminEnquiries(query) {
  const filter = { deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = query.startDate;
    if (query.endDate) filter.createdAt.$lte = query.endDate;
  }
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { referenceNumber: rx },
      { name: rx },
      { email: rx },
      { subject: rx },
      { message: rx },
    ];
  }

  const sort = query.sort === 'last_activity' ? { lastActivityAt: -1 } : { createdAt: -1 };
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    ContactEnquiry.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
    ContactEnquiry.countDocuments(filter),
  ]);

  return {
    data: rows.map((r) => ContactEnquiry.hydrate(r).toSafeObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getAdminEnquiry(id) {
  const enquiry = await getEnquiryOrThrow(id);
  return enquiry.toSafeObject({ includeAdmin: true });
}

export async function updateEnquiryStatus(req, id, status) {
  const enquiry = await getEnquiryOrThrow(id);
  const from = enquiry.status;
  if (from === status) return enquiry.toSafeObject({ includeAdmin: true });

  enquiry.status = status;
  applyStatusTimestamps(enquiry, status);
  enquiry.lastActivityAt = new Date();
  enquiry.pushStatus(from, status, req.user._id);
  await enquiry.save();
  return enquiry.toSafeObject({ includeAdmin: true });
}

export async function addEnquiryReply(req, id, input) {
  const enquiry = await getEnquiryOrThrow(id);
  const message = cleanText(input.message, 5000);
  if (!message) throw new AppError('Message is required', 400, 'INVALID_MESSAGE');

  // Idempotent on client key: skip if an identical reply was just recorded.
  const recent = (enquiry.replies || []).slice(-20);
  if (input.idempotencyKey && recent.some((r) => r.message === message && r.senderId.toString() === req.user._id.toString())) {
    return enquiry.toSafeObject({ includeAdmin: true });
  }

  enquiry.replies = enquiry.replies || [];
  enquiry.replies.push({
    senderId: req.user._id,
    senderRole: req.role?.slug === 'instructor' ? 'instructor' : 'admin',
    message,
    notifiedAt: null,
    createdAt: new Date(),
  });
  if (enquiry.replies.length > 100) enquiry.replies = enquiry.replies.slice(-100);
  enquiry.lastActivityAt = new Date();
  await enquiry.save();

  const reply = enquiry.replies[enquiry.replies.length - 1];
  const notification = await notify({
    to: enquiry.email,
    subject: `Re: ${enquiry.subject} — ${enquiry.referenceNumber}`,
    template: 'contact_enquiry_reply',
    idempotencyKey: `enquiry-reply:${enquiry._id}:${reply._id}`,
    meta: {
      studentName: enquiry.name,
      enquiryNumber: enquiry.referenceNumber,
      title: enquiry.subject,
      message: `Reference Number: ${enquiry.referenceNumber}\n\n${message}`,
    },
  });
  if (notification.notified || notification.duplicate) {
    reply.notifiedAt = new Date();
    await enquiry.save();
  }

  return enquiry.toSafeObject({ includeAdmin: true });
}

export async function addEnquiryNote(req, id, input) {
  const enquiry = await getEnquiryOrThrow(id);
  const message = cleanText(input.message, 5000);
  if (!message) throw new AppError('Message is required', 400, 'INVALID_MESSAGE');

  enquiry.internalNotes = enquiry.internalNotes || [];
  enquiry.internalNotes.push({
    authorId: req.user._id,
    authorRole: req.role?.slug === 'instructor' ? 'instructor' : 'admin',
    message,
    createdAt: new Date(),
  });
  if (enquiry.internalNotes.length > 100) enquiry.internalNotes = enquiry.internalNotes.slice(-100);
  enquiry.lastActivityAt = new Date();
  await enquiry.save();
  return enquiry.toSafeObject({ includeAdmin: true });
}

export async function getEnquiryHistory(id) {
  const enquiry = await getEnquiryOrThrow(id);
  return {
    referenceNumber: enquiry.referenceNumber,
    status: enquiry.status,
    history: (enquiry.statusHistory || []).map((h) => ({
      from: h.from,
      to: h.to,
      actorId: h.actorId?.toString?.() || null,
      at: h.at,
    })),
  };
}
