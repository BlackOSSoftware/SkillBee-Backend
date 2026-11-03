import sanitizeHtml from 'sanitize-html';
import { REFERRAL_STATUS, Referral } from '../../../models/Referral.js';
import { emitAppEventAsync } from '../../../services/events/eventBus.service.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';

function clean(text, max) {
  return sanitizeHtml(String(text || ''), { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, max);
}

export async function submitReferral(input) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dup = await Referral.findOne({
    referrerEmail: String(input.email).toLowerCase(),
    friendPhone: clean(input.friendPhone, 30),
    createdAt: { $gte: since },
    deletedAt: null,
  });
  if (dup) {
    throw new AppError('Similar referral already submitted recently', 409, 'DUPLICATE_REFERRAL');
  }

  const doc = await Referral.create({
    referrerName: clean(input.name, 120),
    referrerEmail: String(input.email).toLowerCase().trim(),
    referrerPhone: clean(input.phone, 30),
    friendName: clean(input.friendName, 120),
    friendPhone: clean(input.friendPhone, 30),
    message: clean(input.message || '', 2000),
    status: REFERRAL_STATUS.PENDING,
  });

  emitAppEventAsync('referral.submitted', {
    referralId: doc._id,
    email: doc.referrerEmail,
    referrerName: doc.referrerName,
    friendName: doc.friendName,
  });

  return doc.toPublicReceipt();
}

export async function listReferrals(query) {
  const filter = { deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = query.startDate;
    if (query.endDate) filter.createdAt.$lte = query.endDate;
  }
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { referrerName: rx },
      { referrerEmail: rx },
      { referrerPhone: rx },
      { friendName: rx },
      { friendPhone: rx },
    ];
  }
  const sort = query.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    Referral.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
    Referral.countDocuments(filter),
  ]);
  return {
    data: rows.map((r) => Referral.hydrate(r).toAdminObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getReferral(id) {
  const doc = await Referral.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Referral not found', 404, 'REFERRAL_NOT_FOUND');
  return doc;
}

export async function updateReferralStatus(req, id, { status, adminNotes }) {
  const doc = await getReferral(id);
  doc.status = status;
  if (adminNotes !== undefined) doc.adminNotes = clean(adminNotes, 5000);
  doc.handledBy = req.user._id;
  doc.handledAt = new Date();
  await doc.save();
  return doc.toAdminObject();
}

export async function deleteReferral(id) {
  const doc = await getReferral(id);
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toAdminObject();
}
