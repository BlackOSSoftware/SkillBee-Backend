import { z } from 'zod';
import { REVIEW_STATUS } from '../../../config/security.js';
import { objectId } from './common.js';

export const createReviewBody = z
  .object({
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(150).optional(),
    comment: z.string().trim().max(2000).optional(),
  })
  .strict();

export const updateReviewBody = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    title: z.string().trim().max(150).optional(),
    comment: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((v) => v.rating !== undefined || v.title !== undefined || v.comment !== undefined, {
    message: 'At least one of rating, title, comment is required',
  });

export const reviewStatusSchema = z
  .object({
    status: z.enum([REVIEW_STATUS.APPROVED, REVIEW_STATUS.REJECTED]),
    rejectionReason: z.string().trim().max(2000).optional(),
  })
  .strict();

export const reviewIdParamSchema = z.object({
  reviewId: objectId.optional(),
  id: objectId.optional(),
}).refine((v) => v.reviewId || v.id, { message: 'id required' });

export const courseReviewParamSchema = z.object({ id: objectId });

export const adminReviewListQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  status: z.enum([REVIEW_STATUS.PENDING, REVIEW_STATUS.APPROVED, REVIEW_STATUS.REJECTED]).optional(),
  courseId: objectId.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).optional(),
});

export const publicReviewListQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).optional(),
});
