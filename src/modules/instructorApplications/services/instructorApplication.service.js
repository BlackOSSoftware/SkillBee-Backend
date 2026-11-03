import sanitizeHtml from 'sanitize-html';
import { ANY_OTHER_SUBJECT } from '../../../config/instructorSubjects.js';
import {
  INSTRUCTOR_APP_STATUS,
  InstructorApplication,
} from '../../../models/InstructorApplication.js';
import { emitAppEventAsync } from '../../../services/events/eventBus.service.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import { deleteResumeFile, storeResumeFile } from './resumeStorage.service.js';

function clean(text, max) {
  return sanitizeHtml(String(text || ''), { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, max);
}

export async function submitApplication(input, file) {
  let resumeMeta = null;
  try {
    resumeMeta = await storeResumeFile(file);
    if (input.expertSubject === ANY_OTHER_SUBJECT && !clean(input.comments, 5000)) {
      throw new AppError(
        'Comments are required when subject is Any Other Course',
        400,
        'COMMENTS_REQUIRED'
      );
    }

    // Soft duplicate: same email+phone pending in last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dup = await InstructorApplication.findOne({
      email: String(input.email).toLowerCase(),
      phone: clean(input.phone, 30),
      status: INSTRUCTOR_APP_STATUS.PENDING,
      createdAt: { $gte: since },
      deletedAt: null,
    });
    if (dup) {
      throw new AppError(
        'An application was already submitted recently',
        409,
        'DUPLICATE_APPLICATION'
      );
    }

    const doc = await InstructorApplication.create({
      fullName: clean(input.fullName, 120),
      phone: clean(input.phone, 30),
      email: String(input.email).toLowerCase().trim(),
      expertSubject: input.expertSubject,
      expertiseLevel: input.expertiseLevel,
      resume: resumeMeta,
      linkedinProfileUrl: clean(input.linkedinProfileUrl || '', 500),
      comments: clean(input.comments || '', 5000),
      status: INSTRUCTOR_APP_STATUS.PENDING,
      auditLog: [{ action: 'submitted', at: new Date() }],
    });

    emitAppEventAsync('instructor.application_submitted', {
      applicationId: doc._id,
      email: doc.email,
      fullName: doc.fullName,
      expertSubject: doc.expertSubject,
    });

    return doc.toPublicReceipt();
  } catch (err) {
    if (resumeMeta?.storagePath) {
      await deleteResumeFile(resumeMeta.storagePath);
    }
    throw err;
  }
}

export async function listApplications(query) {
  const filter = { deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.expertSubject) filter.expertSubject = query.expertSubject;
  if (query.expertiseLevel) filter.expertiseLevel = query.expertiseLevel;
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ fullName: rx }, { email: rx }, { phone: rx }];
  }
  const sort = query.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    InstructorApplication.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
    InstructorApplication.countDocuments(filter),
  ]);
  return {
    data: rows.map((r) => InstructorApplication.hydrate(r).toAdminObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getApplication(id) {
  const doc = await InstructorApplication.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Application not found', 404, 'APPLICATION_NOT_FOUND');
  return doc;
}

export async function updateStatus(req, id, { status, adminNotes }) {
  const doc = await getApplication(id);
  const from = doc.status;
  doc.status = status;
  if (adminNotes !== undefined) doc.adminNotes = clean(adminNotes, 5000);
  doc.reviewedBy = req.user._id;
  doc.reviewedAt = new Date();
  doc.auditLog = doc.auditLog || [];
  doc.auditLog.push({
    action: 'status_changed',
    actorId: req.user._id,
    at: new Date(),
    meta: { from, to: status },
  });
  await doc.save();
  return doc.toAdminObject();
}

export async function deleteApplication(req, id) {
  const doc = await getApplication(id);
  doc.deletedAt = new Date();
  doc.auditLog = doc.auditLog || [];
  doc.auditLog.push({ action: 'deleted', actorId: req.user._id, at: new Date() });
  await doc.save();
  return doc.toAdminObject();
}
