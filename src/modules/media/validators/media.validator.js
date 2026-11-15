import { z } from 'zod';
import { MEDIA_CATEGORIES, MEDIA_TYPES, MEDIA_VISIBILITY } from '../../../models/MediaAsset.js';

const objectId = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId');

export const initiateUploadSchema = z
  .object({
    mediaType: z.enum(MEDIA_TYPES),
    category: z.enum(MEDIA_CATEGORIES),
    originalFileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(3).max(150),
    sizeBytes: z.number().int().positive(),
    courseId: objectId.optional(),
    lessonId: objectId.optional(),
  })
  .strict();

export const confirmUploadSchema = z
  .object({
    uploadId: z.string().trim().min(8).max(64),
    provider: z.enum(['cloudinary', 'local']).optional(),
    cloudinary: z
      .object({
        publicId: z.string().min(1),
        secureUrl: z.string().url(),
        bytes: z.number().int().nonnegative().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        format: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const updateMediaSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    altText: z.string().max(300).optional(),
    category: z.enum(MEDIA_CATEGORIES).optional(),
    visibility: z.enum(MEDIA_VISIBILITY).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

export const listMediaQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  mediaType: z.enum(MEDIA_TYPES).optional(),
  category: z.enum(MEDIA_CATEGORIES).optional(),
  storageProvider: z.enum(['cloudinary', 'local']).optional(),
  processingStatus: z
    .enum(['pending', 'uploading', 'processing', 'ready', 'failed'])
    .optional(),
  ownerId: objectId.optional(),
  courseId: objectId.optional(),
  lessonId: objectId.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sortBy: z.enum(['createdAt', 'sizeBytes', 'title', 'originalFileName']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  includeDeleted: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const listCourseVideosQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  courseId: objectId.optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  processingStatus: z
    .enum(['pending', 'uploading', 'processing', 'ready', 'failed'])
    .optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sortBy: z.enum(['createdAt', 'sizeBytes', 'title']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const mediaIdParamSchema = z.object({ id: objectId });
export const uploadIdParamSchema = z.object({ uploadId: z.string().min(8).max(64) });
