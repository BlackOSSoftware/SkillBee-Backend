import { z } from 'zod';
import {
  LIVE_APPLICATION_STATUSES,
  LIVE_COURSE_INTERESTS,
  LIVE_COURSE_REFERRAL_SOURCES,
} from '../../../config/security.js';

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId');

const phoneRegex = /^\+?[0-9][0-9\s\-()]{6,19}$/;

export const submitApplicationBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    whatsappNumber: z.string().trim().regex(phoneRegex, 'Invalid WhatsApp number'),
    currentCompany: z.string().trim().min(1).max(200),
    currentCity: z.string().trim().min(1).max(120),
    courseInterested: z.enum(LIVE_COURSE_INTERESTS),
    liveCourse: objectId,
    referralSource: z.enum(LIVE_COURSE_REFERRAL_SOURCES),
    comment: z.string().trim().max(2000).optional().default(''),
  })
  .strict();

export const adminListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(LIVE_APPLICATION_STATUSES).optional(),
  liveCourse: objectId.optional(),
  courseInterested: z.enum(LIVE_COURSE_INTERESTS).optional(),
  search: z.string().trim().max(120).optional(),
});

export const statusBody = z
  .object({
    status: z.enum(LIVE_APPLICATION_STATUSES),
  })
  .strict();

export const remarksBody = z
  .object({
    adminRemarks: z.string().trim().max(4000),
  })
  .strict();

export const idParam = z.object({ id: objectId });
