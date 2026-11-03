import crypto from 'crypto';
import { Certificate } from '../../../models/Certificate.js';
import { Course } from '../../../models/Course.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { User } from '../../../models/User.js';
import { AppError } from '../../../utils/AppError.js';
import { getOrSetCache } from '../../../services/cache/cache.service.js';
import {
  CACHE_TTL,
  adminCertificatesKey,
  studentCertificatesKey,
} from '../../../services/cache/keys.js';
import { invalidateCertificateCaches } from '../../../services/cache/invalidation.service.js';
import { validateCompletionRequirements } from './certificateEligibility.service.js';
import { allocateCertificateNumber } from './certificateNumber.service.js';
import {
  buildVerificationUrl,
  cleanupTempFiles,
  generateCertificatePdf,
  readCertificatePdfBuffer,
} from './certificatePdf.service.js';
import { resolveIssuableTemplate } from './template.service.js';

function secureVerificationCode() {
  return crypto.randomBytes(24).toString('hex');
}

function studentDisplayName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;
}

/**
 * Issue certificate after backend eligibility. Never trusts client snapshots.
 */
export async function issueCertificate(req, input) {
  const { studentId, courseId, templateId, reason, replaceRevokedId } = input;

  // Reject trusted client override fields if somehow present
  for (const forbidden of [
    'studentName',
    'courseName',
    'completionDate',
    'certificateNumber',
    'eligible',
    'progressPercentage',
  ]) {
    if (input[forbidden] !== undefined) {
      throw new AppError(`Field ${forbidden} is not accepted`, 400, 'TRUST_VIOLATION');
    }
  }

  const eligibility = await validateCompletionRequirements(studentId, courseId);
  const student = await User.findOne({ _id: studentId, deletedAt: null });
  if (!student) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
  const course = await Course.findOne({ _id: courseId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');

  const enrollment = await CourseEnrollment.findById(eligibility.enrollmentId);
  if (!enrollment) throw new AppError('Enrollment not found', 404, 'ENROLLMENT_NOT_FOUND');

  const chosenTemplateId = templateId || course.certificate?.templateId || null;
  const template = await resolveIssuableTemplate(chosenTemplateId);
  const templateSnapshot = template.toSnapshot();

  const issueDate = new Date();
  const completionDate = eligibility.completionDate
    ? new Date(eligibility.completionDate)
    : issueDate;
  const certificateNumber = await allocateCertificateNumber(issueDate);
  const verificationCode = secureVerificationCode();
  const verificationUrl = buildVerificationUrl(verificationCode);

  let pdfResult;
  try {
    pdfResult = await generateCertificatePdf({
      certificateNumber,
      verificationCode,
      verificationUrl,
      studentName: studentDisplayName(student),
      courseName: course.title,
      completionDate,
      issueDate,
      templateSnapshot,
    });
  } catch (err) {
    throw err;
  }

  try {
    const certificate = new Certificate({
      certificateNumber,
      verificationCode,
      studentId: student._id,
      courseId: course._id,
      enrollmentId: enrollment._id,
      certificateTemplateId: template._id,
      templateSnapshot,
      studentNameSnapshot: studentDisplayName(student),
      courseNameSnapshot: course.title,
      organizationNameSnapshot: templateSnapshot.organizationName || 'SkillBee',
      completionDate,
      issueDate,
      verificationUrl,
      pdfStorageKey: pdfResult.pdfStorageKey,
      pdfFileName: pdfResult.pdfFileName,
      pdfChecksum: pdfResult.pdfChecksum,
      certificateStatus: 'issued',
      issueSource: input.issueSource || 'manual',
      issuedBy: req?.user?._id || null,
      eligibilitySnapshot: eligibility,
      replacesCertificateId: replaceRevokedId || null,
    });
    certificate.pushHistory({
      action: 'issued',
      actorId: req?.user?._id || null,
      reason: reason || (input.issueSource === 'automatic' ? 'Automatic issuance' : 'Manual issuance'),
    });
    await certificate.save();

    if (replaceRevokedId) {
      await Certificate.updateOne(
        { _id: replaceRevokedId },
        { $set: { replacedByCertificateId: certificate._id } }
      );
    }

    await cleanupTempFiles(pdfResult.tempFiles);
    await invalidateCertificateCaches({
      studentId: student._id.toString(),
      courseId: course._id.toString(),
    });

    try {
      const { emitAppEventAsync } = await import('../../../services/events/eventBus.service.js');
      emitAppEventAsync('certificate.generated', {
        userId: student._id,
        email: student.email,
        firstName: student.firstName,
        lastName: student.lastName,
        certificateId: certificate._id,
        certificateNumber: certificate.certificateNumber,
        courseName: course.title,
      });
    } catch {
      /* ignore */
    }

    return certificate.toSafeObject({ includeInternal: true });
  } catch (err) {
    await cleanupTempFiles(pdfResult?.tempFiles);
    // Unique index race → duplicate active certificate
    if (err?.code === 11000) {
      throw new AppError(
        'An active certificate already exists for this enrollment',
        409,
        'DUPLICATE_CERTIFICATE'
      );
    }
    throw err;
  }
}

/** Fire-and-forget auto issue — safe to call from progress recalculation */
export function scheduleAutomaticIssuance({ studentId, courseId, actorId = null }) {
  setImmediate(async () => {
    try {
      const course = await Course.findOne({ _id: courseId, deletedAt: null })
        .select('certificate')
        .lean();
      if (!course?.certificate?.enabled || !course.certificate.autoIssue) return;

      const existing = await Certificate.exists({
        studentId,
        courseId,
        certificateStatus: 'issued',
        deletedAt: null,
      });
      if (existing) return;

      await issueCertificate(
        { user: actorId ? { _id: actorId } : null },
        {
          studentId: studentId.toString(),
          courseId: courseId.toString(),
          issueSource: 'automatic',
          reason: 'Course completion auto-issue',
        }
      );
    } catch (err) {
      console.warn('[certificate] auto-issue skipped:', err.message);
    }
  });
}

export async function revokeCertificate(req, id, reason) {
  const certificate = await Certificate.findOne({ _id: id, deletedAt: null });
  if (!certificate) throw new AppError('Certificate not found', 404, 'CERTIFICATE_NOT_FOUND');
  if (certificate.certificateStatus === 'revoked') {
    return certificate.toSafeObject({ includeInternal: true });
  }

  certificate.certificateStatus = 'revoked';
  certificate.revokedAt = new Date();
  certificate.revokedBy = req.user._id;
  certificate.revocationReason = reason || 'Revoked by administrator';
  certificate.pushHistory({
    action: 'revoked',
    actorId: req.user._id,
    reason: certificate.revocationReason,
  });
  await certificate.save();
  await invalidateCertificateCaches({
    studentId: certificate.studentId.toString(),
    courseId: certificate.courseId.toString(),
  });
  return certificate.toSafeObject({ includeInternal: true });
}

export async function regenerateCertificatePdf(req, id) {
  const certificate = await Certificate.findOne({ _id: id, deletedAt: null });
  if (!certificate) throw new AppError('Certificate not found', 404, 'CERTIFICATE_NOT_FOUND');
  if (certificate.certificateStatus !== 'issued') {
    throw new AppError('Only issued certificates can be regenerated', 400, 'INVALID_STATUS');
  }

  const pdfResult = await generateCertificatePdf({
    certificateNumber: certificate.certificateNumber,
    verificationCode: certificate.verificationCode,
    verificationUrl: certificate.verificationUrl,
    studentName: certificate.studentNameSnapshot,
    courseName: certificate.courseNameSnapshot,
    completionDate: certificate.completionDate,
    issueDate: certificate.issueDate,
    templateSnapshot: certificate.templateSnapshot,
  });

  certificate.pdfStorageKey = pdfResult.pdfStorageKey;
  certificate.pdfFileName = pdfResult.pdfFileName;
  certificate.pdfChecksum = pdfResult.pdfChecksum;
  certificate.pushHistory({
    action: 'regenerated',
    actorId: req.user._id,
    reason: 'PDF regenerated',
    meta: { pdfChecksum: pdfResult.pdfChecksum },
  });
  await certificate.save();
  await cleanupTempFiles(pdfResult.tempFiles);
  await invalidateCertificateCaches({
    studentId: certificate.studentId.toString(),
    courseId: certificate.courseId.toString(),
  });
  return certificate.toSafeObject({ includeInternal: true });
}

export async function listAdminCertificates(query = {}) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const filter = { deletedAt: null };
  if (query.studentId) filter.studentId = query.studentId;
  if (query.courseId) filter.courseId = query.courseId;
  if (query.status) filter.certificateStatus = query.status;

  return getOrSetCache(adminCertificatesKey(query), CACHE_TTL.DASHBOARD, async () => {
    const [rows, total] = await Promise.all([
      Certificate.find(filter)
        .sort({ issueDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Certificate.countDocuments(filter),
    ]);
    return {
      certificates: rows.map((c) => c.toSafeObject({ includeInternal: true })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  });
}

export async function getAdminCertificate(id) {
  const certificate = await Certificate.findOne({ _id: id, deletedAt: null });
  if (!certificate) throw new AppError('Certificate not found', 404, 'CERTIFICATE_NOT_FOUND');
  return certificate.toSafeObject({ includeInternal: true });
}

export async function getCertificateHistory(id) {
  const certificate = await Certificate.findOne({ _id: id, deletedAt: null })
    .select('history certificateNumber certificateStatus')
    .lean();
  if (!certificate) throw new AppError('Certificate not found', 404, 'CERTIFICATE_NOT_FOUND');
  return {
    certificateId: certificate._id.toString(),
    certificateNumber: certificate.certificateNumber,
    history: (certificate.history || []).map((h) => ({
      id: h._id?.toString?.(),
      action: h.action,
      actorId: h.actorId?.toString?.() || null,
      reason: h.reason,
      meta: h.meta,
      at: h.at,
    })),
  };
}

export async function downloadCertificatePdf(certificate, { asAttachment = true } = {}) {
  const buffer = await readCertificatePdfBuffer(certificate.pdfStorageKey);
  return {
    buffer,
    fileName: certificate.pdfFileName || `${certificate.certificateNumber}.pdf`,
    checksum: certificate.pdfChecksum,
    asAttachment,
  };
}

export async function getAdminDownload(id) {
  const certificate = await Certificate.findOne({ _id: id, deletedAt: null });
  if (!certificate) throw new AppError('Certificate not found', 404, 'CERTIFICATE_NOT_FOUND');
  return downloadCertificatePdf(certificate);
}

export async function listStudentCertificates(req) {
  const studentId = req.user._id.toString();
  return getOrSetCache(studentCertificatesKey(studentId), CACHE_TTL.DASHBOARD, async () => {
    const rows = await Certificate.find({
      studentId: req.user._id,
      deletedAt: null,
    }).sort({ issueDate: -1 });
    return { certificates: rows.map((c) => c.toSafeObject()) };
  });
}

export async function getStudentCertificate(req, id) {
  const certificate = await Certificate.findOne({
    _id: id,
    studentId: req.user._id,
    deletedAt: null,
  });
  if (!certificate) throw new AppError('Certificate not found', 404, 'CERTIFICATE_NOT_FOUND');
  return certificate.toSafeObject();
}

export async function getStudentDownload(req, id) {
  const certificate = await Certificate.findOne({
    _id: id,
    studentId: req.user._id,
    deletedAt: null,
  });
  if (!certificate) throw new AppError('Certificate not found', 404, 'CERTIFICATE_NOT_FOUND');
  return downloadCertificatePdf(certificate);
}

export async function verifyByCode(code) {
  if (!code || String(code).length < 16) {
    return { verificationStatus: 'not_found' };
  }
  const certificate = await Certificate.findOne({
    verificationCode: String(code).trim(),
    deletedAt: null,
  });
  if (!certificate) {
    return { verificationStatus: 'not_found' };
  }
  return certificate.toPublicVerification();
}
