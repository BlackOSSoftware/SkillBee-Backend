import { FAQ_STATUS, Faq } from '../../../models/Faq.js';
import { getOrSetCache, clearCacheByPrefix } from '../../../services/cache/cache.service.js';
import { buildFaqPageSchema } from '../../seo/services/schema.service.js';
import { sanitizeRichText } from '../../../utils/sanitizeHtml.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';

const PUBLIC_PREFIX = 'faq:public:';

async function invalidateFaqCaches() {
  await clearCacheByPrefix(PUBLIC_PREFIX);
}

export async function createFaq(req, input) {
  const doc = await Faq.create({
    question: String(input.question).trim().slice(0, 500),
    answer: sanitizeRichText(input.answer || ''),
    category: String(input.category || 'general').trim().slice(0, 120),
    relatedCourseId: input.relatedCourseId || null,
    displayOrder: input.displayOrder ?? 0,
    status: FAQ_STATUS.DRAFT,
    isFeatured: Boolean(input.isFeatured),
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await invalidateFaqCaches();
  return doc.toAdminObject();
}

export async function updateFaq(req, id, input) {
  const doc = await Faq.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('FAQ not found', 404, 'FAQ_NOT_FOUND');
  if (input.question !== undefined) doc.question = String(input.question).trim().slice(0, 500);
  if (input.answer !== undefined) doc.answer = sanitizeRichText(input.answer);
  if (input.category !== undefined) doc.category = String(input.category).trim().slice(0, 120);
  if (input.relatedCourseId !== undefined) doc.relatedCourseId = input.relatedCourseId || null;
  if (input.displayOrder !== undefined) doc.displayOrder = input.displayOrder;
  if (input.isFeatured !== undefined) doc.isFeatured = Boolean(input.isFeatured);
  doc.updatedBy = req.user._id;
  await doc.save();
  await invalidateFaqCaches();
  return doc.toAdminObject();
}

export async function setFaqStatus(req, id, status) {
  const doc = await Faq.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('FAQ not found', 404, 'FAQ_NOT_FOUND');
  doc.status = status;
  doc.updatedBy = req.user._id;
  await doc.save();
  await invalidateFaqCaches();
  return doc.toAdminObject();
}

export async function deleteFaq(req, id) {
  const doc = await Faq.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('FAQ not found', 404, 'FAQ_NOT_FOUND');
  doc.deletedAt = new Date();
  doc.updatedBy = req.user._id;
  await doc.save();
  await invalidateFaqCaches();
  return doc.toAdminObject();
}

export async function reorderFaqs(req, orderedIds = []) {
  const ops = orderedIds.map((id, index) =>
    Faq.updateOne(
      { _id: id, deletedAt: null },
      { $set: { displayOrder: index, updatedBy: req.user._id } }
    )
  );
  await Promise.all(ops);
  await invalidateFaqCaches();
  return { updated: orderedIds.length };
}

export async function listAdminFaqs(query) {
  const filter = { deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.relatedCourseId) filter.relatedCourseId = query.relatedCourseId;
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ question: rx }, { answer: rx }];
  }
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    Faq.find(filter).sort({ displayOrder: 1, createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    Faq.countDocuments(filter),
  ]);
  return {
    data: rows.map((r) => Faq.hydrate(r).toAdminObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getAdminFaq(id) {
  const doc = await Faq.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('FAQ not found', 404, 'FAQ_NOT_FOUND');
  return doc.toAdminObject();
}

export async function listPublicFaqs(query) {
  const key = `${PUBLIC_PREFIX}${query.category || '-'}:${query.relatedCourseId || '-'}:${query.page}:${query.limit}`;
  return getOrSetCache(key, 120, async () => {
    const filter = { deletedAt: null, status: FAQ_STATUS.PUBLISHED };
    if (query.category) filter.category = query.category;
    if (query.relatedCourseId) filter.relatedCourseId = query.relatedCourseId;
    const skip = getSkip(query);
    const [rows, total] = await Promise.all([
      Faq.find(filter).sort({ displayOrder: 1, createdAt: -1 }).skip(skip).limit(query.limit).lean(),
      Faq.countDocuments(filter),
    ]);
    const data = rows.map((r) => Faq.hydrate(r).toPublicObject());
    return {
      data,
      pagination: buildPagination({ page: query.page, limit: query.limit, total }),
      schema: buildFaqPageSchema(data),
    };
  });
}

export async function getPublicFaq(id) {
  const doc = await Faq.findOne({
    _id: id,
    deletedAt: null,
    status: FAQ_STATUS.PUBLISHED,
  });
  if (!doc) throw new AppError('FAQ not found', 404, 'FAQ_NOT_FOUND');
  return doc.toPublicObject();
}

export async function listCourseFaqs(courseId, query) {
  return listPublicFaqs({ ...query, relatedCourseId: courseId });
}

export { buildFaqPageSchema };
