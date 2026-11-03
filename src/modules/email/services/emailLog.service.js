import { EmailLog } from '../../../models/EmailLog.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';

export async function listEmailLogs(query) {
  const filter = {};
  if (query.recipient) filter.recipient = query.recipient.toLowerCase();
  if (query.status) filter.status = query.status;
  if (query.eventType) filter.eventType = query.eventType;
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = query.startDate;
    if (query.endDate) filter.createdAt.$lte = query.endDate;
  }
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    EmailLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    EmailLog.countDocuments(filter),
  ]);
  return {
    data: rows.map((r) => EmailLog.hydrate(r).toSafeObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getEmailLog(id) {
  const doc = await EmailLog.findById(id);
  if (!doc) throw new AppError('Email log not found', 404, 'EMAIL_LOG_NOT_FOUND');
  return doc.toSafeObject();
}
