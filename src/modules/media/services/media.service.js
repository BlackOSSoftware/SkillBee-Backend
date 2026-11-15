import crypto from 'crypto';
import { createReadStream, existsSync, statSync } from 'fs';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env.js';
import { COURSE_STATUS, ROLE_SLUGS, USER_STATUS } from '../../../config/security.js';
import { Certificate } from '../../../models/Certificate.js';
import { CertificateTemplate } from '../../../models/CertificateTemplate.js';
import { Course } from '../../../models/Course.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { CourseResource } from '../../../models/CourseResource.js';
import { MediaAsset } from '../../../models/MediaAsset.js';
import { MediaUploadSession } from '../../../models/MediaUploadSession.js';
import { User } from '../../../models/User.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import {
  getMediaCategoriesCatalog,
  validateUploadRequest,
} from '../utils/fileValidation.js';
import { resolveInsideRoot, getUploadRoot } from '../utils/storagePath.js';
import { sanitizeOriginalFileName } from '../utils/safeFilename.js';
import {
  createCloudinaryPublicIdHint,
  destroyCloudinaryImage,
  uploadImageBufferToCloudinary,
  verifyCloudinaryUpload,
} from './cloudinary.service.js';
import {
  deleteLocalKey,
  fileExists,
  finalizeTemporaryFile,
  getFileSize,
  streamToTemporaryFile,
} from './localStorage.service.js';
import { getOwnedSession, verifyUploadToken } from './uploadSession.service.js';
import { resolveVideoProcessingStatus } from './videoProcessing.service.js';
import { getStorageStatistics } from './storageAnalytics.service.js';

function isPlatformAdmin(role) {
  return role?.slug === ROLE_SLUGS.SUPER_ADMIN || role?.slug === ROLE_SLUGS.ADMIN;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function assertCanAccessAsset(req, asset) {
  if (isPlatformAdmin(req.role)) return;
  if (req.role?.slug === ROLE_SLUGS.INSTRUCTOR) {
    if (asset.uploadedBy?.toString() === req.user._id.toString()) return;
    if (asset.courseId) {
      const course = await Course.findById(asset.courseId).select('instructorIds');
      const ok = (course?.instructorIds || []).some(
        (id) => id.toString() === req.user._id.toString()
      );
      if (ok) return;
    }
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  throw new AppError('Forbidden', 403, 'FORBIDDEN');
}

/** Shared mapper: CourseLesson with populated course/topic → Media Library item. */
function toLessonVideoItem(lesson) {
  const video = lesson.content?.video || {};
  const course = lesson.courseId && typeof lesson.courseId === 'object' ? lesson.courseId : null;
  const topic = lesson.topicId && typeof lesson.topicId === 'object' ? lesson.topicId : null;
  return {
    id: `lesson:${lesson._id.toString()}`,
    source: 'lesson_video',
    mediaType: 'video',
    title: lesson.title,
    originalFileName: video.originalFileName || lesson.title,
    mimeType: video.mimeType || 'video/mp4',
    extension: 'mp4',
    sizeBytes: video.sizeBytes || 0,
    durationSeconds: video.durationSeconds || 0,
    width: null,
    height: null,
    storageProvider: 'local',
    processingStatus: video.processingStatus || 'ready',
    category: 'lesson_video',
    visibility: 'private',
    secureUrl: null,
    thumbnailUrl: null,
    altText: null,
    description: null,
    deletedAt: null,
    createdAt: video.uploadedAt || lesson.createdAt,
    updatedAt: lesson.updatedAt,
    courseId: lesson.courseId?._id?.toString?.() || lesson.courseId?.toString?.() || null,
    courseName: course?.title || null,
    courseSlug: course?.slug || null,
    topicId: lesson.topicId?._id?.toString?.() || lesson.topicId?.toString?.() || null,
    topicName: topic?.title || null,
    lessonId: lesson._id.toString(),
    lessonTitle: lesson.title,
    lessonStatus: lesson.status,
    isPreview: Boolean(lesson.isPreview),
    hasHls: Boolean(video.hlsMasterPath),
    playback: { lessonId: lesson._id.toString() },
  };
}

function lessonVideoSortField(sortBy) {
  if (sortBy === 'sizeBytes') return 'content.video.sizeBytes';
  if (sortBy === 'originalFileName') return 'content.video.originalFileName';
  if (sortBy === 'title') return 'title';
  return 'createdAt';
}

function sortKeyOf(item, sortBy) {
  if (sortBy === 'sizeBytes') return item.sizeBytes || 0;
  if (sortBy === 'title') return (item.title || '').toLowerCase();
  if (sortBy === 'originalFileName') return (item.originalFileName || '').toLowerCase();
  return new Date(item.createdAt).getTime();
}

/**
 * Lesson videos are stored on CourseLesson.content.video (local storage), NOT as
 * MediaAsset records. `listMedia` merges them into All Media so every discoverable
 * video appears in one place; `listCourseVideos` exposes them as a dedicated tab.
 * Items use stable synthetic ids (`lesson:<lessonId>`) — no MediaAsset is created.
 */
function buildLessonVideoFilter(query, req) {
  const filter = {
    deletedAt: null,
    'content.video.storageKey': { $exists: true, $ne: null },
  };
  if (query.courseId) filter.courseId = query.courseId;
  if (query.lessonId) filter._id = query.lessonId;
  if (query.status) filter.status = query.status;
  if (query.processingStatus) filter['content.video.processingStatus'] = query.processingStatus;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ title: rx }, { 'content.video.originalFileName': rx }];
  }
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
  }
  if (req.role?.slug === ROLE_SLUGS.INSTRUCTOR) {
    return filter; // courseId scoping applied by caller (needs async course lookup)
  }
  return filter;
}

async function scopeLessonFilterToInstructor(filter, req) {
  const courses = await Course.find({
    instructorIds: req.user._id,
    deletedAt: null,
  }).select('_id');
  filter.courseId = { $in: courses.map((c) => c._id) };
  return filter;
}

/** Lesson videos belong in All Media only when the filters can apply to them. */
function shouldIncludeLessonVideos(query) {
  if (query.mediaType && query.mediaType !== 'video') return false;
  if (query.category && query.category !== 'lesson_video') return false;
  if (query.storageProvider && query.storageProvider !== 'local') return false;
  if (query.ownerId) return false; // lesson videos have no owner
  return true;
}

export async function listMedia(req, query = {}) {
  const filter = {};
  if (query.includeDeleted !== true && query.includeDeleted !== 'true') {
    filter.deletedAt = null;
  }
  if (query.mediaType) filter.mediaType = query.mediaType;
  if (query.category) filter.category = query.category;
  if (query.storageProvider) filter.storageProvider = query.storageProvider;
  if (query.processingStatus) filter.processingStatus = query.processingStatus;
  if (query.ownerId) filter.ownerId = query.ownerId;
  if (query.courseId) filter.courseId = query.courseId;
  if (query.lessonId) filter.lessonId = query.lessonId;
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
  }
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ title: rx }, { originalFileName: rx }];
  }

  if (req.role?.slug === ROLE_SLUGS.INSTRUCTOR) {
    const courses = await Course.find({
      instructorIds: req.user._id,
      deletedAt: null,
    }).select('_id');
    const courseIds = courses.map((c) => c._id);
    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [
          { uploadedBy: req.user._id },
          { courseId: { $in: courseIds } },
        ],
      },
    ];
  }

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = getSkip({ page, limit });
  const sortByAllow = new Set(['createdAt', 'sizeBytes', 'title', 'originalFileName']);
  const sortBy = sortByAllow.has(query.sortBy) ? query.sortBy : 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const includeLessonVideos = shouldIncludeLessonVideos(query);

  if (!includeLessonVideos) {
    const [rows, total] = await Promise.all([
      MediaAsset.find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit),
      MediaAsset.countDocuments(filter),
    ]);
    return {
      media: rows.map((r) => r.toSafeObject()),
      pagination: buildPagination({ page, limit, total }),
    };
  }

  // Merged path: MediaAsset rows + lesson videos, deduped by physical storageKey.
  let lessonFilter = buildLessonVideoFilter(query, req);
  if (req.role?.slug === ROLE_SLUGS.INSTRUCTOR) {
    lessonFilter = await scopeLessonFilterToInstructor(lessonFilter, req);
  }
  // A lesson video whose storageKey is already registered as a MediaAsset is the
  // same physical file — the MediaAsset record is canonical, so skip the lesson copy.
  const assetKeys = await MediaAsset.distinct('storageKey', { storageKey: { $ne: null } });
  if (assetKeys.length) {
    lessonFilter['content.video.storageKey'] = {
      $exists: true,
      $ne: null,
      $nin: assetKeys,
    };
  }

  const fetchCount = skip + limit;
  const lessonSortField = lessonVideoSortField(sortBy);
  const [assetRows, assetTotal, lessonRows, lessonTotal] = await Promise.all([
    MediaAsset.find(filter).sort({ [sortBy]: sortOrder }).limit(fetchCount),
    MediaAsset.countDocuments(filter),
    CourseLesson.find(lessonFilter)
      .populate('courseId', 'title slug')
      .populate('topicId', 'title slug')
      .sort({ [lessonSortField]: sortOrder })
      .limit(fetchCount),
    CourseLesson.countDocuments(lessonFilter),
  ]);

  const merged = [
    ...assetRows.map((r) => {
      const item = r.toSafeObject();
      return { item, key: sortKeyOf(item, sortBy) };
    }),
    ...lessonRows.map((l) => {
      const item = toLessonVideoItem(l);
      return { item, key: sortKeyOf(item, sortBy) };
    }),
  ];
  merged.sort((a, b) => {
    if (a.key < b.key) return -sortOrder;
    if (a.key > b.key) return sortOrder;
    return 0;
  });

  return {
    media: merged.slice(skip, skip + limit).map((m) => m.item),
    pagination: buildPagination({ page, limit, total: assetTotal + lessonTotal }),
  };
}

/**
 * Course/lesson videos are stored on CourseLesson.content.video (local storage),
 * NOT as MediaAsset records. This aggregates them for the Media Library so
 * existing course videos are discoverable and playable from one place.
 * Items use stable synthetic ids (`lesson:<lessonId>`) — no MediaAsset is created.
 */
export async function listCourseVideos(req, query = {}) {
  let filter = buildLessonVideoFilter(query, req);
  if (req.role?.slug === ROLE_SLUGS.INSTRUCTOR) {
    filter = await scopeLessonFilterToInstructor(filter, req);
  }

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = getSkip({ page, limit });
  const sortByAllow = new Set(['createdAt', 'sizeBytes', 'title']);
  const sortBy = sortByAllow.has(query.sortBy) ? query.sortBy : 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
  const sortField = lessonVideoSortField(sortBy);

  const [rows, total] = await Promise.all([
    CourseLesson.find(filter)
      .populate('courseId', 'title slug')
      .populate('topicId', 'title slug')
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit),
    CourseLesson.countDocuments(filter),
  ]);

  return { videos: rows.map(toLessonVideoItem), pagination: buildPagination({ page, limit, total }) };
}

export async function getMediaById(req, id, { includeDeleted = false } = {}) {
  const filter = { _id: id };
  if (!includeDeleted) filter.deletedAt = null;
  const asset = await MediaAsset.findOne(filter);
  if (!asset) throw new AppError('Media not found', 404, 'MEDIA_NOT_FOUND');
  await assertCanAccessAsset(req, asset);
  const references = await findReferences(asset);
  return {
    ...asset.toSafeObject(),
    referenceCount: references.total,
  };
}

export async function updateMediaMetadata(req, id, input) {
  const asset = await MediaAsset.findOne({ _id: id, deletedAt: null });
  if (!asset) throw new AppError('Media not found', 404, 'MEDIA_NOT_FOUND');
  await assertCanAccessAsset(req, asset);

  if (input.title !== undefined) asset.title = input.title;
  if (input.description !== undefined) asset.description = input.description;
  if (input.altText !== undefined) asset.altText = input.altText;
  if (input.visibility !== undefined) asset.visibility = input.visibility;
  if (input.category !== undefined) {
    const map = {
      course_thumbnail: 'image',
      course_gallery: 'image',
      instructor_image: 'image',
      lesson_video: 'video',
      study_material: 'document',
    };
    if (map[input.category] && map[input.category] !== asset.mediaType) {
      throw new AppError('Category incompatible with media type', 400, 'CATEGORY_TYPE_MISMATCH');
    }
    asset.category = input.category;
  }
  await asset.save();
  return asset.toSafeObject();
}

export async function findReferences(asset) {
  const refs = {
    courses: [],
    lessons: [],
    resources: [],
    instructors: [],
    certificateTemplates: [],
    certificates: [],
    total: 0,
  };

  // Certificate templates and issued certificates embed image refs (background, logo,
  // signature) as { mediaAssetId, storageKey, url } — match on any of the three.
  const mediaRefOr = [{ 'backgroundImage.mediaAssetId': asset._id }];
  for (const field of ['organizationLogo', 'signatureImage']) {
    mediaRefOr.push({ [`${field}.mediaAssetId`]: asset._id });
  }
  if (asset.storageKey) {
    for (const field of ['backgroundImage', 'organizationLogo', 'signatureImage']) {
      mediaRefOr.push({ [`${field}.storageKey`]: asset.storageKey });
    }
  }
  if (asset.secureUrl) {
    for (const field of ['backgroundImage', 'organizationLogo', 'signatureImage']) {
      mediaRefOr.push({ [`${field}.url`]: asset.secureUrl });
    }
  }
  const snapshotOr = mediaRefOr.map((cond) => {
    const [key, value] = Object.entries(cond)[0];
    return { [`templateSnapshot.${key}`]: value };
  });

  const [templates, issued] = await Promise.all([
    CertificateTemplate.find({ deletedAt: null, $or: mediaRefOr })
      .select('_id name templateCode')
      .limit(50),
    Certificate.find({ deletedAt: null, $or: snapshotOr })
      .select('_id certificateNumber courseNameSnapshot')
      .limit(50),
  ]);
  refs.certificateTemplates = templates.map((t) => ({
    id: t._id.toString(),
    title: t.name,
    slug: t.templateCode,
    type: 'certificate_template',
  }));
  refs.certificates = issued.map((c) => ({
    id: c._id.toString(),
    title: c.certificateNumber || c.courseNameSnapshot || 'Certificate',
    type: 'issued_certificate',
  }));

  if (asset.storageProvider === 'cloudinary' && asset.publicId) {
    const courses = await Course.find({
      deletedAt: null,
      $or: [
        { 'thumbnail.publicId': asset.publicId },
        { 'gallery.publicId': asset.publicId },
      ],
    }).select('_id title slug');
    refs.courses = courses.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      slug: c.slug,
      type: 'course_image',
    }));
  }

  if (asset.storageProvider === 'local' && asset.storageKey) {
    const lessons = await CourseLesson.find({
      deletedAt: null,
      'content.video.storageKey': asset.storageKey,
    }).select('_id title courseId');
    refs.lessons = lessons.map((l) => ({
      id: l._id.toString(),
      title: l.title,
      courseId: l.courseId.toString(),
      type: 'lesson_video',
    }));

    const resources = await CourseResource.find({
      deletedAt: null,
      storageKey: asset.storageKey,
    }).select('_id title courseId lessonId');
    refs.resources = resources.map((r) => ({
      id: r._id.toString(),
      title: r.title,
      courseId: r.courseId?.toString(),
      lessonId: r.lessonId?.toString(),
      type: 'course_resource',
    }));
  }

  if (asset.courseId) {
    refs.courses.push({
      id: asset.courseId.toString(),
      type: 'linked_courseId',
    });
  }
  if (asset.lessonId) {
    refs.lessons.push({
      id: asset.lessonId.toString(),
      type: 'linked_lessonId',
    });
  }
  if (asset.resourceId) {
    refs.resources.push({
      id: asset.resourceId.toString(),
      type: 'linked_resourceId',
    });
  }

  // Deduplicate by id within each group (an asset can match a record via several fields)
  // and across the rough total.
  const dedupe = (arr) => {
    const seen = new Set();
    return arr.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  };
  refs.courses = dedupe(refs.courses);
  refs.lessons = dedupe(refs.lessons);
  refs.resources = dedupe(refs.resources);
  refs.certificateTemplates = dedupe(refs.certificateTemplates);
  refs.certificates = dedupe(refs.certificates);

  refs.total =
    refs.courses.length +
    refs.lessons.length +
    refs.resources.length +
    refs.certificateTemplates.length +
    refs.certificates.length;

  return refs;
}

export async function deleteMedia(req, id) {
  const asset = await MediaAsset.findOne({ _id: id, deletedAt: null });
  if (!asset) throw new AppError('Media not found', 404, 'MEDIA_NOT_FOUND');
  await assertCanAccessAsset(req, asset);

  const references = await findReferences(asset);
  // linked_courseId alone from optional FK should not block if no real usage — count only usage refs
  const blocking = [
    ...references.courses.filter((r) => r.type !== 'linked_courseId'),
    ...references.lessons.filter((r) => r.type !== 'linked_lessonId'),
    ...references.resources.filter((r) => r.type !== 'linked_resourceId'),
    ...references.certificateTemplates,
    ...references.certificates,
  ];
  if (blocking.length > 0) {
    throw new AppError('Media is still referenced', 409, 'MEDIA_IN_USE', {
      references: {
        courses: references.courses.filter((r) => r.type !== 'linked_courseId'),
        lessons: references.lessons.filter((r) => r.type !== 'linked_lessonId'),
        resources: references.resources.filter((r) => r.type !== 'linked_resourceId'),
        certificateTemplates: references.certificateTemplates,
        certificates: references.certificates,
      },
    });
  }

  asset.deletedAt = new Date();
  await asset.save();

  try {
    if (asset.storageProvider === 'cloudinary' && asset.publicId) {
      await destroyCloudinaryImage(asset.publicId);
    }
    if (asset.storageProvider === 'local' && asset.storageKey) {
      await deleteLocalKey(asset.storageKey);
    }
  } catch (err) {
    asset.deletionError = err.message;
    await asset.save();
  }

  return asset.toSafeObject();
}

export async function restoreMedia(req, id) {
  const asset = await MediaAsset.findOne({ _id: id, deletedAt: { $ne: null } });
  if (!asset) throw new AppError('Deleted media not found', 404, 'MEDIA_NOT_FOUND');
  await assertCanAccessAsset(req, asset);

  if (asset.storageProvider === 'local' && asset.storageKey) {
    const exists = await fileExists(asset.storageKey);
    if (!exists) {
      throw new AppError(
        'Local file no longer exists; metadata restore only is not allowed',
        422,
        'FILE_GONE'
      );
    }
  }

  asset.deletedAt = null;
  asset.deletionError = null;
  await asset.save();
  return asset.toSafeObject();
}

export async function receiveLocalUpload(req, uploadId, fileStream, uploadToken) {
  const session = await getOwnedSession(req, uploadId);
  if (session.storageProvider !== 'local') {
    throw new AppError('Session is not a local upload', 400, 'INVALID_PROVIDER');
  }
  if (['confirmed', 'expired', 'failed'].includes(session.status)) {
    throw new AppError(`Session status is ${session.status}`, 409, 'INVALID_SESSION_STATUS');
  }
  verifyUploadToken(session, uploadToken);

  session.status = 'uploading';
  await session.save();

  try {
    const saved = await streamToTemporaryFile({
      fileStream,
      originalFileName: session.originalFileName,
      expectedMimeType: session.expectedMimeType,
      maxBytes: session.expectedSizeBytes,
    });

    // Mark token used (single-use) after successful bytes landed
    session.uploadTokenUsedAt = new Date();
    session.temporaryStorageKey = saved.temporaryStorageKey;
    session.uploadedSizeBytes = saved.sizeBytes;
    session.checksum = saved.checksum;
    session.providerMeta = { storedFileName: saved.storedFileName };
    session.status = 'uploaded';
    await session.save();
    return session.toSafeObject();
  } catch (err) {
    session.status = 'failed';
    session.failureReason = err.message;
    await session.save();
    throw err;
  }
}

/**
 * Direct server→Cloudinary image upload (multipart).
 * Use this when there is no browser Cloudinary widget — file actually lands on Cloudinary.
 */
export async function directUploadImage(req, meta, file) {
  if (!file?.buffer && !file?.path) {
    throw new AppError('Image file is required', 400, 'FILE_REQUIRED');
  }
  const originalFileName = sanitizeOriginalFileName(
    meta.originalFileName || file.originalname || 'image.png'
  );
  const mimeType = file.mimetype || meta.mimeType;
  const sizeBytes = file.size || meta.sizeBytes || file.buffer?.length;
  validateUploadRequest({
    mediaType: 'image',
    category: meta.category || 'course_thumbnail',
    originalFileName,
    mimeType,
    sizeBytes,
  });

  if (meta.courseId) {
    const course = await Course.findOne({ _id: meta.courseId, deletedAt: null });
    if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
    if (
      req.role?.slug === ROLE_SLUGS.INSTRUCTOR &&
      !(course.instructorIds || []).some((id) => id.toString() === req.user._id.toString())
    ) {
      throw new AppError('Not assigned to this course', 403, 'FORBIDDEN');
    }
  }

  const uploadId = crypto.randomBytes(12).toString('hex');
  const folder = `${env.CLOUDINARY_UPLOAD_FOLDER}/${meta.category || 'course_thumbnail'}`;
  const publicIdHint = createCloudinaryPublicIdHint(
    meta.category || 'course_thumbnail',
    uploadId
  );

  let buffer = file.buffer;
  if (!buffer && file.path) {
    const { readFile } = await import('fs/promises');
    buffer = await readFile(file.path);
  }

  const uploaded = await uploadImageBufferToCloudinary(buffer, {
    folder,
    publicId: publicIdHint,
    originalFileName,
  });

  const asset = await MediaAsset.create({
    title: meta.title || originalFileName,
    description: meta.description || '',
    altText: meta.altText || '',
    originalFileName,
    storedFileName: uploaded.publicId,
    mediaType: 'image',
    category: meta.category || 'course_thumbnail',
    storageProvider: 'cloudinary',
    publicId: uploaded.publicId,
    secureUrl: uploaded.secureUrl,
    mimeType,
    sizeBytes: uploaded.bytes || sizeBytes,
    width: uploaded.width,
    height: uploaded.height,
    processingStatus: 'ready',
    visibility: 'public',
    downloadAllowed: false,
    ownerId: req.user._id,
    uploadedBy: req.user._id,
    courseId: meta.courseId || null,
    lessonId: meta.lessonId || null,
    checksum: crypto
      .createHash('sha256')
      .update(`${uploaded.publicId}:${uploaded.secureUrl}`)
      .digest('hex'),
  });

  return asset.toSafeObject();
}

export async function confirmUpload(req, { uploadId, provider, cloudinary }) {
  const session = await getOwnedSession(req, uploadId);
  if (session.status === 'confirmed' && session.mediaAssetId) {
    const existing = await MediaAsset.findById(session.mediaAssetId);
    return existing.toSafeObject();
  }
  if (session.expiresAt < new Date()) {
    throw new AppError('Upload session expired', 410, 'UPLOAD_SESSION_EXPIRED');
  }
  if (provider && provider !== session.storageProvider) {
    throw new AppError('Provider mismatch', 400, 'PROVIDER_MISMATCH');
  }

  if (session.storageProvider === 'cloudinary') {
    const meta = await verifyCloudinaryUpload({
      publicId: cloudinary?.publicId || session.cloudinaryPublicIdHint,
      secureUrl: cloudinary?.secureUrl,
      bytes: cloudinary?.bytes || session.expectedSizeBytes,
      width: cloudinary?.width,
      height: cloudinary?.height,
      format: cloudinary?.format,
      expectedFolder: session.cloudinaryFolder,
    });

    const asset = await MediaAsset.create({
      title: session.originalFileName,
      originalFileName: session.originalFileName,
      storedFileName: meta.publicId,
      mediaType: 'image',
      category: session.category,
      storageProvider: 'cloudinary',
      publicId: meta.publicId,
      secureUrl: meta.secureUrl,
      mimeType: session.expectedMimeType,
      sizeBytes: meta.bytes || session.expectedSizeBytes,
      width: meta.width,
      height: meta.height,
      processingStatus: 'ready',
      visibility: 'public',
      downloadAllowed: false,
      ownerId: session.ownerId,
      uploadedBy: session.uploadedBy,
      courseId: session.courseId,
      lessonId: session.lessonId,
      checksum: crypto
        .createHash('sha256')
        .update(`${meta.publicId}:${meta.secureUrl}`)
        .digest('hex'),
    });

    session.status = 'confirmed';
    session.mediaAssetId = asset._id;
    session.providerMeta = meta;
    await session.save();
    return asset.toSafeObject();
  }

  // local
  if (session.status !== 'uploaded' || !session.temporaryStorageKey) {
    throw new AppError(
      'Local file must be uploaded before confirmation',
      422,
      'UPLOAD_NOT_COMPLETE'
    );
  }
  const exists = await fileExists(session.temporaryStorageKey);
  if (!exists) throw new AppError('Uploaded file missing', 422, 'UPLOAD_FILE_MISSING');

  const actualSize = await getFileSize(session.temporaryStorageKey);
  if (actualSize !== session.uploadedSizeBytes) {
    throw new AppError('Uploaded size mismatch', 422, 'SIZE_MISMATCH');
  }
  if (actualSize > session.expectedSizeBytes) {
    throw new AppError('File exceeds declared size', 413, 'FILE_TOO_LARGE');
  }

  const storedFileName =
    session.providerMeta?.storedFileName ||
    `${crypto.randomBytes(8).toString('hex')}`;
  const finalized = await finalizeTemporaryFile({
    temporaryStorageKey: session.temporaryStorageKey,
    mediaType: session.mediaType,
    storedFileName,
  });

  const videoProc =
    session.mediaType === 'video'
      ? resolveVideoProcessingStatus()
      : { processingStatus: 'ready' };

  const asset = await MediaAsset.create({
    title: session.originalFileName,
    originalFileName: session.originalFileName,
    storedFileName,
    mediaType: session.mediaType,
    category: session.category,
    storageProvider: 'local',
    storageKey: finalized.storageKey,
    mimeType: session.expectedMimeType,
    sizeBytes: actualSize,
    checksum: session.checksum,
    processingStatus: videoProc.processingStatus,
    visibility: 'protected',
    downloadAllowed: session.mediaType === 'document',
    ownerId: session.ownerId,
    uploadedBy: session.uploadedBy,
    courseId: session.courseId,
    lessonId: session.lessonId,
  });

  // Optionally link study material as CourseResource without duplicating binary
  if (session.mediaType === 'document' && session.lessonId) {
    const lesson = await CourseLesson.findOne({ _id: session.lessonId, deletedAt: null });
    if (lesson) {
      const resource = await CourseResource.create({
        courseId: lesson.courseId,
        topicId: lesson.topicId,
        lessonId: lesson._id,
        title: session.originalFileName,
        resourceType: session.expectedMimeType === 'application/pdf' ? 'pdf' : 'document',
        storageProvider: 'local',
        storageKey: finalized.storageKey,
        originalFileName: session.originalFileName,
        mimeType: session.expectedMimeType,
        sizeBytes: actualSize,
        checksum: session.checksum,
        visibility: 'enrolled',
        status: 'active',
        createdBy: req.user._id,
        uploadedBy: req.user._id,
      });
      asset.resourceId = resource._id;
      await asset.save();
    }
  }

  session.status = 'confirmed';
  session.mediaAssetId = asset._id;
  session.finalStorageKey = finalized.storageKey;
  session.temporaryStorageKey = null;
  await session.save();
  return asset.toSafeObject();
}

/**
 * View/playback only — never Content-Disposition: attachment for image/video.
 */
export async function getLearningPlayback(req, mediaId) {
  if (req.user?.status === USER_STATUS.SUSPENDED) {
    throw new AppError('Account is suspended', 403, 'ACCOUNT_SUSPENDED');
  }

  const asset = await MediaAsset.findOne({ _id: mediaId, deletedAt: null });
  if (!asset) throw new AppError('Media not found', 404, 'MEDIA_NOT_FOUND');

  if (asset.mediaType === 'image') {
    // Images: return Cloudinary display URL only (no download force)
    await assertLearnerAccess(req, asset);
    asset.lastAccessedAt = new Date();
    await asset.save();
    return {
      type: 'image',
      accessMode: 'view_only',
      downloadAllowed: false,
      secureUrl: asset.secureUrl,
      contentDisposition: 'inline',
    };
  }

  if (asset.mediaType !== 'video') {
    throw new AppError('Playback is only for images/videos', 422, 'NOT_PLAYABLE');
  }

  if (asset.processingStatus !== 'ready') {
    throw new AppError(
      `Video not ready for viewing (status: ${asset.processingStatus})`,
      422,
      'VIDEO_NOT_READY'
    );
  }

  await assertLearnerAccess(req, asset);

  const token = jwt.sign(
    {
      sub: req.user._id.toString(),
      mediaId: asset._id.toString(),
      storageKey: asset.storageKey,
      type: 'media_view',
      disposition: 'inline',
    },
    env.PLAYBACK_TOKEN_SECRET,
    { expiresIn: env.PLAYBACK_TOKEN_EXPIRES_IN }
  );

  asset.lastAccessedAt = new Date();
  await asset.save();

  return {
    type: 'video',
    accessMode: 'view_only',
    downloadAllowed: false,
    viewToken: token,
    streamUrl: `${env.API_PREFIX}/learning/media/${asset._id}/stream`,
    expiresIn: env.PLAYBACK_TOKEN_EXPIRES_IN,
    contentDisposition: 'inline',
  };
}

async function assertLearnerAccess(req, asset) {
  if (isPlatformAdmin(req.role)) return;

  let course = null;
  let lesson = null;
  if (asset.lessonId) {
    lesson = await CourseLesson.findOne({ _id: asset.lessonId, deletedAt: null });
  }
  if (asset.courseId || lesson?.courseId) {
    course = await Course.findOne({
      _id: asset.courseId || lesson.courseId,
      deletedAt: null,
    });
  }

  if (req.role?.slug === ROLE_SLUGS.INSTRUCTOR && course) {
    const ok = (course.instructorIds || []).some(
      (id) => id.toString() === req.user._id.toString()
    );
    if (ok) return;
  }

  if (course && course.status === COURSE_STATUS.ARCHIVED) {
    throw new AppError('Course is archived', 404, 'COURSE_ARCHIVED');
  }

  if (lesson) {
    if (lesson.status !== 'published' && !isPlatformAdmin(req.role)) {
      throw new AppError('Lesson not available', 404, 'LESSON_NOT_FOUND');
    }
    if (lesson.scheduledAt && lesson.scheduledAt > new Date()) {
      throw new AppError('Lesson is scheduled for later release', 403, 'SCHEDULED');
    }
  }

  const { learningEnrollmentQuery } = await import(
    '../../enrollment/services/enrollmentAccess.service.js'
  );
  const enrolled = course
    ? Boolean(
        await CourseEnrollment.exists(learningEnrollmentQuery(req.user._id, course._id))
      )
    : false;

  const previewOk = lesson?.isPreview && lesson.status === 'published';
  if (!enrolled && !previewOk && asset.visibility !== 'public') {
    throw new AppError('Enrollment required', 403, 'NOT_ENROLLED');
  }
}

export async function streamMediaView(req, res, mediaId) {
  const token = req.query.token || req.headers['x-view-token'] || req.headers['x-playback-token'];
  if (!token) throw new AppError('View token required', 401, 'VIEW_TOKEN_REQUIRED');

  let payload;
  try {
    payload = jwt.verify(token, env.PLAYBACK_TOKEN_SECRET);
  } catch {
    throw new AppError('Invalid or expired view token', 401, 'VIEW_TOKEN_INVALID');
  }

  if (payload.type !== 'media_view' || payload.mediaId !== mediaId) {
    throw new AppError('View token mismatch', 403, 'VIEW_TOKEN_MISMATCH');
  }
  // The signed view token is the capability (issued only after access checks at
  // /playback). When a session is also present, enforce same-user — mirrors the
  // lesson video stream behaviour.
  if (req.user && payload.sub !== req.user._id.toString()) {
    throw new AppError('View token user mismatch', 403, 'VIEW_TOKEN_MISMATCH');
  }

  const asset = await MediaAsset.findOne({ _id: mediaId, deletedAt: null });
  if (!asset || asset.mediaType !== 'video') {
    throw new AppError('Video not found', 404, 'MEDIA_NOT_FOUND');
  }

  const absolute = resolveInsideRoot(getUploadRoot(), payload.storageKey || asset.storageKey);
  if (!existsSync(absolute)) throw new AppError('Video file missing', 404, 'MEDIA_FILE_MISSING');

  const stat = statSync(absolute);
  const fileSize = stat.size;
  const range = req.headers.range;

  // VIEW ONLY — never attachment / download
  res.setHeader('Content-Type', asset.mimeType || 'video/mp4');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Accept-Ranges', 'bytes');
  // Helmet defaults CORP to same-origin, which blocks cross-origin <video>
  // (no-cors) requests. The signed view token is the authorization capability,
  // so allow cross-origin embedding for this route only — do not weaken Helmet globally.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) throw new AppError('Invalid Range header', 416, 'INVALID_RANGE');
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : fileSize - 1;
    if (start >= fileSize || end >= fileSize || start > end) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      throw new AppError('Requested range not satisfiable', 416, 'INVALID_RANGE');
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', end - start + 1);
    createReadStream(absolute, { start, end }).pipe(res);
    return;
  }

  res.setHeader('Content-Length', fileSize);
  createReadStream(absolute).pipe(res);
}

export { getStorageStatistics, getMediaCategoriesCatalog };
