import { z } from 'zod';
import { EXPERTISE_LEVELS, INSTRUCTOR_SUBJECTS } from '../../../config/instructorSubjects.js';
import { INSTRUCTOR_APP_STATUS } from '../../../models/InstructorApplication.js';
import { objectId } from '../../courses/validators/common.js';

export const submitApplicationBody = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .trim()
      .regex(/^[+]?[\d\s\-()]{7,20}$/, 'Invalid phone'),
    email: z.string().trim().email().max(254),
    expertSubject: z.enum(INSTRUCTOR_SUBJECTS),
    expertiseLevel: z.enum(EXPERTISE_LEVELS),
    linkedinProfileUrl: z
      .string()
      .trim()
      .max(500)
      .refine(
        (v) => !v || /^https?:\/\/(www\.)?linkedin\.com\//i.test(v),
        'Invalid LinkedIn URL'
      )
      .optional()
      .or(z.literal('')),
    comments: z.string().trim().max(5000).optional().or(z.literal('')),
  })
  .strict();

export const adminListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.enum(Object.values(INSTRUCTOR_APP_STATUS)).optional(),
  expertSubject: z.enum(INSTRUCTOR_SUBJECTS).optional(),
  expertiseLevel: z.enum(EXPERTISE_LEVELS).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export const statusBody = z
  .object({
    status: z.enum(Object.values(INSTRUCTOR_APP_STATUS)),
    adminNotes: z.string().trim().max(5000).optional(),
  })
  .strict();

export const idParam = z.object({ id: objectId });
