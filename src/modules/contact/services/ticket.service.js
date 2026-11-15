import crypto from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import {
  MESSAGE_VISIBILITY,
  PERMISSIONS,
  ROLE_SLUGS,
  SUPPORT_STATUS,
  TICKET_SENDER_ROLES,
} from '../../../config/security.js';
import { SupportTicket } from '../../../models/SupportTicket.js';
import { User } from '../../../models/User.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { notify } from './notify.service.js';
import { notifyUser } from '../../notifications/services/notification.service.js';

function cleanText(value, max) {
  return sanitizeHtml(String(value || ''), { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, max);
}

function generateTicketNumber() {
  return `TKT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function mapAttachments(raw = []) {
  return (raw || [])
    .slice(0, 5)
    .map((a) => ({
      mediaAssetId: a.mediaAssetId || null,
      fileName: cleanText(a.fileName || '', 255),
      mimeType: cleanText(a.mimeType || '', 120),
      publicUrl: /^https?:\/\//i.test(String(a.publicUrl || '')) ? String(a.publicUrl).slice(0, 2000) : '',
    }))
    .filter((a) => a.publicUrl || a.mediaAssetId || a.fileName);
}

function senderRoleFromReq(req) {
  const slug = req.role?.slug;
  if (slug === 'super_admin' || slug === 'admin') return TICKET_SENDER_ROLES.ADMIN;
  if (slug === 'instructor') return TICKET_SENDER_ROLES.INSTRUCTOR;
  return TICKET_SENDER_ROLES.STUDENT;
}

async function createWithNumberRetry(payload) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await SupportTicket.create({ ...payload, ticketNumber: generateTicketNumber() });
    } catch (err) {
      if (err?.code === 11000 && attempt < 2) continue;
      throw err;
    }
  }
  throw new AppError('Could not allocate ticket number', 500, 'REFERENCE_ALLOCATION_FAILED');
}

async function getTicketOrThrow(id, { includeDeleted = false } = {}) {
  const filter = { _id: id };
  if (!includeDeleted) filter.deletedAt = null;
  const ticket = await SupportTicket.findOne(filter);
  if (!ticket) throw new AppError('Ticket not found', 404, 'TICKET_NOT_FOUND');
  return ticket;
}

function applyStatusTimestamps(ticket, status) {
  const now = new Date();
  if (status === SUPPORT_STATUS.RESOLVED) {
    ticket.resolvedAt = now;
    ticket.closedAt = null;
  } else if (ticket.resolvedAt && status !== SUPPORT_STATUS.RESOLVED) {
    ticket.resolvedAt = null;
  }
  if (status === SUPPORT_STATUS.CLOSED) {
    ticket.closedAt = now;
    ticket.resolvedAt = ticket.resolvedAt || now;
  } else if (ticket.closedAt && status !== SUPPORT_STATUS.CLOSED) {
    ticket.closedAt = null;
  }
}

async function studentEmail(ticket) {
  const student = await User.findById(ticket.studentId).select('email firstName lastName');
  if (!student?.email) return null;
  const name = [student.firstName, student.lastName].filter(Boolean).join(' ') || student.email;
  return { email: student.email, name };
}

export async function createTicket(req, input) {
  const description = cleanText(input.description, 10000);
  const ticket = await createWithNumberRetry({
    studentId: req.user._id,
    category: input.category,
    subject: cleanText(input.subject, 200),
    description,
    priority: input.priority || 'normal',
    status: SUPPORT_STATUS.OPEN,
    statusHistory: [{ from: null, to: SUPPORT_STATUS.OPEN, actorId: req.user._id, at: new Date() }],
    // The opening description is the first public conversation message.
    messages: [
      {
        senderId: req.user._id,
        senderRole: TICKET_SENDER_ROLES.STUDENT,
        visibility: MESSAGE_VISIBILITY.PUBLIC,
        message: description,
        attachments: [],
        createdAt: new Date(),
      },
    ],
    lastActivityAt: new Date(),
  });

  const student = await studentEmail(ticket);
  if (student) {
    // In-app notification (bell + toast in student dashboard)
    await notifyUser({
      recipientId: ticket.studentId,
      title: `Ticket ${ticket.ticketNumber} created`,
      message: `Your support ticket "${ticket.subject}" has been submitted.`,
      type: 'custom',
      category: 'support',
      eventKey: `ticket-created:${ticket._id}:notify`,
      data: { ticketId: ticket._id.toString(), ticketNumber: ticket.ticketNumber },
    });
    // Email notification
    await notify({
      to: student.email,
      subject: `Your Support Ticket Has Been Created – ${ticket.ticketNumber}`,
      template: 'support_ticket_created',
      idempotencyKey: `ticket-created:${ticket._id}`,
      meta: {
        studentName: student.name,
        ticketNumber: ticket.ticketNumber,
        title: ticket.subject,
        message: `Ticket Number: ${ticket.ticketNumber}\nSubject: ${ticket.subject}\nStatus: Open\n\nOur support team has received your request and will review it shortly.`,
      },
    });
  }

  return ticket.toSafeObject();
}

export async function listMyTickets(req, query) {
  const filter = { studentId: req.user._id, deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ ticketNumber: rx }, { subject: rx }, { description: rx }];
  }
  const sort = query.sort === 'last_activity' ? { lastActivityAt: -1 } : { createdAt: -1 };
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    SupportTicket.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
    SupportTicket.countDocuments(filter),
  ]);
  return {
    data: rows.map((r) => SupportTicket.hydrate(r).toSafeObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getMyTicket(req, id) {
  const ticket = await getTicketOrThrow(id);
  if (ticket.studentId.toString() !== req.user._id.toString()) {
    throw new AppError('You can only view your own tickets', 403, 'FORBIDDEN');
  }
  // Student view never includes internal notes (visibility filter in toSafeObject).
  return ticket.toSafeObject();
}

async function pushMessage(ticket, { senderId, senderRole, visibility, message, attachments, idempotencyKey }) {
  ticket.messages = ticket.messages || [];
  if (idempotencyKey) {
    const dup = ticket.messages.find((m) => m.idempotencyKey === idempotencyKey);
    if (dup) return { message: dup, duplicate: true };
  }
  const entry = {
    senderId,
    senderRole,
    visibility,
    message,
    attachments: attachments || [],
    idempotencyKey: idempotencyKey || null,
    notifiedAt: null,
    createdAt: new Date(),
  };
  ticket.messages.push(entry);
  if (ticket.messages.length > 300) ticket.messages = ticket.messages.slice(-300);
  ticket.lastActivityAt = new Date();
  await ticket.save();
  return { message: ticket.messages[ticket.messages.length - 1], duplicate: false };
}

export async function replyMyTicket(req, id, input) {
  const ticket = await getTicketOrThrow(id);
  if (ticket.studentId.toString() !== req.user._id.toString()) {
    throw new AppError('You can only reply to your own tickets', 403, 'FORBIDDEN');
  }
  if (ticket.status === SUPPORT_STATUS.CLOSED) {
    throw new AppError('This ticket is closed; contact support to reopen it', 409, 'TICKET_CLOSED');
  }
  const message = cleanText(input.message, 5000);
  if (!message) throw new AppError('Message is required', 400, 'INVALID_MESSAGE');

  const { duplicate } = await pushMessage(ticket, {
    senderId: req.user._id,
    senderRole: TICKET_SENDER_ROLES.STUDENT,
    visibility: MESSAGE_VISIBILITY.PUBLIC,
    message,
    attachments: mapAttachments(input.attachments),
    idempotencyKey: input.idempotencyKey || null,
  });
  void duplicate;
  return ticket.toSafeObject();
}

export async function listAdminTickets(query) {
  const filter = { deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.priority) filter.priority = query.priority;
  if (query.studentId) filter.studentId = query.studentId;
  if (query.assignedTo) filter.assignedTo = query.assignedTo;
  if (query.unassigned) filter.assignedTo = null;
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = query.startDate;
    if (query.endDate) filter.createdAt.$lte = query.endDate;
  }
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const students = await User.find({
      $or: [{ firstName: rx }, { lastName: rx }, { email: rx }],
    })
      .select('_id')
      .limit(50)
      .lean();
    const ids = students.map((s) => s._id);
    filter.$or = [
      { ticketNumber: rx },
      { subject: rx },
      { description: rx },
      ...(ids.length ? [{ studentId: { $in: ids } }] : []),
    ];
  }

  const sort = query.sort === 'last_activity' ? { lastActivityAt: -1 } : { createdAt: -1 };
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    SupportTicket.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(query.limit)
      .populate('studentId', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .lean(),
    SupportTicket.countDocuments(filter),
  ]);

  return {
    data: rows.map((r) => {
      const t = SupportTicket.hydrate(r).toSafeObject({ includeInternal: true });
      t.student = r.studentId?.email
        ? {
            id: r.studentId._id.toString(),
            firstName: r.studentId.firstName,
            lastName: r.studentId.lastName,
            email: r.studentId.email,
          }
        : null;
      t.assignee = r.assignedTo?.email
        ? {
            id: r.assignedTo._id.toString(),
            firstName: r.assignedTo.firstName,
            lastName: r.assignedTo.lastName,
            email: r.assignedTo.email,
          }
        : null;
      return t;
    }),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getAdminTicket(id) {
  const ticket = await getTicketOrThrow(id);
  const student = await User.findById(ticket.studentId).select('firstName lastName email');
  const assignee = ticket.assignedTo ? await User.findById(ticket.assignedTo).select('firstName lastName email') : null;
  return {
    ...ticket.toSafeObject({ includeInternal: true }),
    student: student
      ? { id: student._id.toString(), firstName: student.firstName, lastName: student.lastName, email: student.email }
      : null,
    assignee: assignee
      ? { id: assignee._id.toString(), firstName: assignee.firstName, lastName: assignee.lastName, email: assignee.email }
      : null,
  };
}

export async function replyAdminTicket(req, id, input) {
  const ticket = await getTicketOrThrow(id);
  const message = cleanText(input.message, 5000);
  if (!message) throw new AppError('Message is required', 400, 'INVALID_MESSAGE');

  const { message: saved, duplicate } = await pushMessage(ticket, {
    senderId: req.user._id,
    senderRole: senderRoleFromReq(req),
    visibility: MESSAGE_VISIBILITY.PUBLIC,
    message,
    attachments: mapAttachments(input.attachments),
    idempotencyKey: input.idempotencyKey || null,
  });
  if (duplicate) return getAdminTicket(id);

  const student = await studentEmail(ticket);
  if (student) {
    // In-app notification (bell + toast in student dashboard)
    await notifyUser({
      recipientId: ticket.studentId,
      title: `New reply on ${ticket.ticketNumber}`,
      message: `Support replied to your ticket "${ticket.subject}".`,
      type: 'custom',
      category: 'support',
      eventKey: `ticket-reply:${ticket._id}:${saved._id}:notify`,
      data: { ticketId: ticket._id.toString(), ticketNumber: ticket.ticketNumber },
    });
    // Email notification
    const notification = await notify({
      to: student.email,
      subject: `New reply on your ticket – ${ticket.ticketNumber}`,
      template: 'support_ticket_reply',
      idempotencyKey: `ticket-reply:${ticket._id}:${saved._id}`,
      meta: {
        studentName: student.name,
        ticketNumber: ticket.ticketNumber,
        title: ticket.subject,
        message: `Ticket Number: ${ticket.ticketNumber}\nSubject: ${ticket.subject}\n\n${message.slice(0, 500)}`,
      },
    });
    if (notification.notified || notification.duplicate) {
      saved.notifiedAt = new Date();
      await ticket.save();
    }
  }

  return getAdminTicket(id);
}

export async function addTicketNote(req, id, input) {
  const ticket = await getTicketOrThrow(id);
  const message = cleanText(input.message, 5000);
  if (!message) throw new AppError('Message is required', 400, 'INVALID_MESSAGE');

  await pushMessage(ticket, {
    senderId: req.user._id,
    senderRole: senderRoleFromReq(req),
    visibility: MESSAGE_VISIBILITY.INTERNAL,
    message,
    attachments: [],
    idempotencyKey: null,
  });
  return getAdminTicket(id);
}

export async function updateTicketStatus(req, id, status) {
  const ticket = await getTicketOrThrow(id);
  const from = ticket.status;
  if (from === status) return getAdminTicket(id);

  ticket.status = status;
  applyStatusTimestamps(ticket, status);
  ticket.lastActivityAt = new Date();
  ticket.pushStatus(from, status, req.user._id);
  await ticket.save();

  const student = await studentEmail(ticket);
  if (student) {
    // In-app notification (bell + toast in student dashboard)
    await notifyUser({
      recipientId: ticket.studentId,
      title: `Ticket ${ticket.ticketNumber} ${status}`,
      message: `Your ticket "${ticket.subject}" moved from ${from} to ${status}.`,
      type: 'custom',
      category: 'support',
      eventKey: `ticket-status:${ticket._id}:${status}:${Date.now()}:notify`,
      data: { ticketId: ticket._id.toString(), ticketNumber: ticket.ticketNumber, status },
    });
    // Email notification
    await notify({
      to: student.email,
      subject: `Ticket ${ticket.ticketNumber} status updated`,
      template: 'support_ticket_status',
      idempotencyKey: `ticket-status:${ticket._id}:${status}:${Date.now()}`,
      meta: {
        studentName: student.name,
        ticketNumber: ticket.ticketNumber,
        title: ticket.subject,
        previousStatus: from,
        newStatus: status,
        message: `Your ticket "${ticket.subject}" moved from ${from} to ${status}.`,
      },
    });
  }

  return getAdminTicket(id);
}

export async function assignTicket(req, id, assignedTo) {
  const ticket = await getTicketOrThrow(id);
  if (assignedTo) {
    const assignee = await User.findOne(User.notDeletedFilter({ _id: assignedTo }))
      .select('_id roleId')
      .populate('roleId', 'slug permissions');
    if (!assignee) throw new AppError('Assignee not found', 404, 'USER_NOT_FOUND');
    const role = assignee.roleId;
    const canManage =
      role?.slug === ROLE_SLUGS.SUPER_ADMIN || (role?.permissions || []).includes(PERMISSIONS.ENQUIRIES_MANAGE);
    if (!canManage) {
      throw new AppError('Assignee does not have permission to manage enquiries', 400, 'INVALID_ASSIGNEE');
    }
  }
  ticket.assignedTo = assignedTo || null;
  ticket.lastActivityAt = new Date();
  await ticket.save();
  return getAdminTicket(id);
}

export async function getTicketHistory(id) {
  const ticket = await getTicketOrThrow(id);
  return {
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    history: (ticket.statusHistory || []).map((h) => ({
      from: h.from,
      to: h.to,
      actorId: h.actorId?.toString?.() || null,
      at: h.at,
    })),
  };
}
