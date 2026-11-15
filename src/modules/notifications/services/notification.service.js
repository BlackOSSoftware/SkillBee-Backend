import sanitizeHtml from 'sanitize-html';
import {
  AppNotification,
  DELIVERY_STATUS,
} from '../../../models/AppNotification.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { User } from '../../../models/User.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { sendPushToUser } from './fcm.service.js';

function clean(text, max) {
  return sanitizeHtml(String(text || ''), { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, max);
}

function safeData(data = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (/password|secret|token|otp|privateKey|smtp/i.test(k)) continue;
    if (v == null) continue;
    if (typeof v === 'object') {
      out[k] = JSON.parse(JSON.stringify(v));
    } else {
      out[k] = String(v).slice(0, 500);
    }
  }
  return out;
}

/**
 * Persist in-app notification + optional push. Idempotent via eventKey.
 */
export async function notifyUser({
  recipientId,
  recipientRole = 'student',
  title,
  message,
  type,
  category = 'general',
  data = {},
  createdBy = null,
  eventKey = null,
  campaignId = null,
  channels = { inApp: true, push: true },
}) {
  const payload = {
    recipientId,
    recipientRole,
    title: clean(title, 200),
    message: clean(message, 2000),
    type,
    category,
    data: safeData(data),
    createdBy,
    eventKey: eventKey || null,
    campaignId: campaignId || null,
    deliveryStatus: DELIVERY_STATUS.PENDING,
  };

  let notification;
  try {
    notification = await AppNotification.create(payload);
  } catch (err) {
    if (err?.code === 11000 && eventKey) {
      const existing = await AppNotification.findOne({
        eventKey,
        recipientId,
        deletedAt: null,
      });
      return { notification: existing?.toSafeObject?.() || null, duplicate: true };
    }
    throw err;
  }

  let delivery = { skipped: true };
  if (channels.push !== false) {
    delivery = await sendPushToUser(recipientId, {
      title: payload.title,
      body: payload.message,
      data: { type, notificationId: notification._id.toString(), ...payload.data },
    });
    if (delivery.skipped) {
      notification.deliveryStatus = DELIVERY_STATUS.SKIPPED;
    } else if (delivery.successCount > 0 && delivery.failureCount === 0) {
      notification.deliveryStatus = DELIVERY_STATUS.SENT;
    } else if (delivery.successCount > 0) {
      notification.deliveryStatus = DELIVERY_STATUS.PARTIAL;
    } else {
      notification.deliveryStatus = DELIVERY_STATUS.FAILED;
    }
    notification.deliveryMeta = {
      successCount: delivery.successCount || 0,
      failureCount: delivery.failureCount || 0,
      reason: delivery.reason || null,
    };
    await notification.save();
  } else {
    notification.deliveryStatus = DELIVERY_STATUS.SKIPPED;
    await notification.save();
  }

  return { notification: notification.toSafeObject(), duplicate: false, delivery };
}

export async function listStudentNotifications(req, query) {
  const filter = { recipientId: req.user._id, deletedAt: null };
  if (query.isRead === true || query.isRead === false) filter.isRead = query.isRead;
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    AppNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    AppNotification.countDocuments(filter),
  ]);
  return {
    data: rows.map((r) => AppNotification.hydrate(r).toSafeObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function listAdminNotifications(query) {
  const filter = { deletedAt: null };
  if (query.type) filter.type = query.type;
  if (query.recipientId) filter.recipientId = query.recipientId;
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    AppNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    AppNotification.countDocuments(filter),
  ]);
  return {
    data: rows.map((r) => AppNotification.hydrate(r).toSafeObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

/**
 * List notification campaigns (grouped by campaignId).
 * Each campaign represents one admin bulk-send action.
 * Notifications without a campaignId are treated as individual (campaignId = null).
 */
export async function listCampaigns(query) {
  const filter = { deletedAt: null };
  if (query.type) filter.type = query.type;
  if (query.createdBy) filter.createdBy = query.createdBy;

  // Aggregate by campaignId (null = individual notification)
  const pipeline = [
    { $match: filter },
    {
      $group: {
        _id: { $ifNull: ['$campaignId', '$_id'] },
        campaignId: { $first: '$campaignId' },
        title: { $first: '$title' },
        message: { $first: '$message' },
        type: { $first: '$type' },
        category: { $first: '$category' },
        createdBy: { $first: '$createdBy' },
        createdAt: { $first: '$createdAt' },
        recipientCount: { $sum: 1 },
        sentCount: {
          $sum: { $cond: [{ $eq: ['$deliveryStatus', 'sent'] }, 1, 0] },
        },
        failedCount: {
          $sum: { $cond: [{ $eq: ['$deliveryStatus', 'failed'] }, 1, 0] },
        },
        skippedCount: {
          $sum: { $cond: [{ $eq: ['$deliveryStatus', 'skipped'] }, 1, 0] },
        },
        partialCount: {
          $sum: { $cond: [{ $eq: ['$deliveryStatus', 'partial'] }, 1, 0] },
        },
        pendingCount: {
          $sum: { $cond: [{ $eq: ['$deliveryStatus', 'pending'] }, 1, 0] },
        },
        readCount: {
          $sum: { $cond: ['$isRead', 1, 0] },
        },
      },
    },
    // Post-group filter for isRead (campaign-level: any read = true, none read = false)
    ...(query.isRead === true
      ? [{ $match: { readCount: { $gt: 0 } } }]
      : query.isRead === false
        ? [{ $match: { readCount: { $eq: 0 } } }]
        : []),
    { $sort: { createdAt: -1 } },
    { $skip: getSkip(query) },
    { $limit: query.limit },
  ];

  // Build the same post-group filter for the count pipeline
  const countPipeline = [
    { $match: filter },
    {
      $group: {
        _id: { $ifNull: ['$campaignId', '$_id'] },
        readCount: {
          $sum: { $cond: ['$isRead', 1, 0] },
        },
        recipientCount: { $sum: 1 },
      },
    },
    ...(query.isRead === true
      ? [{ $match: { readCount: { $gt: 0 } } }]
      : query.isRead === false
        ? [{ $match: { readCount: { $eq: 0 } } }]
        : []),
    { $count: 'total' },
  ];

  const [campaigns, total] = await Promise.all([
    AppNotification.aggregate(pipeline),
    AppNotification.aggregate(countPipeline).then((r) => r[0]?.total ?? 0),
  ]);

  return {
    data: campaigns.map((c) => ({
      campaignId: c.campaignId || c._id.toString(),
      title: c.title,
      message: c.message,
      type: c.type,
      category: c.category,
      createdBy: c.createdBy?.toString?.() || null,
      createdAt: c.createdAt,
      recipientCount: c.recipientCount,
      delivery: {
        sent: c.sentCount,
        failed: c.failedCount,
        skipped: c.skippedCount,
        partial: c.partialCount,
        pending: c.pendingCount,
      },
      readCount: c.readCount,
    })),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

/**
 * Get campaign details with recipient-level delivery records.
 */
export async function getCampaign(campaignId) {
  const filter = { deletedAt: null };
  // If campaignId looks like a single notification ID (no colon), treat as individual
  if (!campaignId.includes(':')) {
    filter._id = campaignId;
  } else {
    filter.campaignId = campaignId;
  }

  const rows = await AppNotification.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  if (!rows.length) throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');

  const first = rows[0];
  const recipients = rows.map((r) => AppNotification.hydrate(r).toSafeObject());

  const delivery = { sent: 0, failed: 0, skipped: 0, partial: 0, pending: 0 };
  let readCount = 0;
  for (const r of recipients) {
    if (r.deliveryStatus === 'sent') delivery.sent += 1;
    else if (r.deliveryStatus === 'failed') delivery.failed += 1;
    else if (r.deliveryStatus === 'skipped') delivery.skipped += 1;
    else if (r.deliveryStatus === 'partial') delivery.partial += 1;
    else delivery.pending += 1;
    if (r.isRead) readCount += 1;
  }

  return {
    campaignId: first.campaignId || first._id.toString(),
    title: first.title,
    message: first.message,
    type: first.type,
    category: first.category,
    createdBy: first.createdBy?.toString?.() || null,
    createdAt: first.createdAt,
    recipientCount: recipients.length,
    delivery,
    readCount,
    recipients,
  };
}

export async function markRead(req, id) {
  const doc = await AppNotification.findOne({
    _id: id,
    recipientId: req.user._id,
    deletedAt: null,
  });
  if (!doc) throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
  if (!doc.isRead) {
    doc.isRead = true;
    doc.readAt = new Date();
    await doc.save();
  }
  return doc.toSafeObject();
}

export async function markAllRead(req) {
  const result = await AppNotification.updateMany(
    { recipientId: req.user._id, deletedAt: null, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return { modified: result.modifiedCount || 0 };
}

export async function deleteOwnNotification(req, id) {
  const doc = await AppNotification.findOne({
    _id: id,
    recipientId: req.user._id,
    deletedAt: null,
  });
  if (!doc) throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toSafeObject();
}

async function* iterateRecipients({ recipientType, recipientIds, courseId }) {
  if (recipientType === 'selected_users' || recipientType === 'selected_students') {
    const ids = recipientIds || [];
    for (const id of ids) yield id;
    return;
  }
  if (recipientType === 'selected_course_students') {
    if (!courseId) throw new AppError('courseId required', 400, 'COURSE_REQUIRED');
    const cursor = CourseEnrollment.find({
      courseId,
      status: { $in: ['active', 'completed'] },
      deletedAt: null,
    })
      .select('studentId')
      .lean()
      .cursor();
    for await (const row of cursor) {
      if (row.studentId) yield row.studentId;
    }
    return;
  }
  if (recipientType === 'all_students') {
    const { ROLE_SLUGS } = await import('../../../config/security.js');
    const { Role } = await import('../../../models/Role.js');
    const role = await Role.findBySlug(ROLE_SLUGS.STUDENT);
    if (!role) return;
    const cursor = User.find({
      roleId: role._id,
      deletedAt: null,
      status: 'active',
    })
      .select('_id')
      .lean()
      .cursor();
    for await (const u of cursor) yield u._id;
  }
}

/**
 * Admin custom / course announcement notification (in-app + optional push).
 * Processes recipients in batches without loading all into memory.
 */
export async function createAdminNotification(req, input) {
  const title = clean(input.title, 200);
  const message = clean(input.message, 2000);
  if (!title || !message) throw new AppError('Title and message required', 400, 'INVALID_INPUT');

  const channel = input.deliveryChannel || 'both';
  const channels = {
    inApp: channel === 'in_app' || channel === 'both',
    push: channel === 'push' || channel === 'both',
  };

  const type = input.type || (input.courseId ? 'course_announcement' : 'custom');
  const campaignId = `custom:${req.user._id}:${Date.now()}`;
  let created = 0;
  let duplicates = 0;
  const seen = new Set();

  for await (const recipientId of iterateRecipients(input)) {
    const rid = recipientId.toString();
    if (seen.has(rid)) continue;
    seen.add(rid);
    const eventKey = `${campaignId}:${rid}`;
    // Fire-and-forget sequential to keep load predictable; still streaming cursor
    // eslint-disable-next-line no-await-in-loop
    const result = await notifyUser({
      recipientId,
      recipientRole: 'student',
      title,
      message,
      type,
      category: input.category || 'announcement',
      data: {
        courseId: input.courseId || null,
        batchId: campaignId,
      },
      createdBy: req.user._id,
      eventKey,
      campaignId,
      channels,
    });
    if (result.duplicate) duplicates += 1;
    else created += 1;
  }

  return { created, duplicates, campaignId, batchId: campaignId, recipientCount: seen.size };
}
