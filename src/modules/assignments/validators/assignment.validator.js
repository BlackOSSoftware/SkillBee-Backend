import { z } from 'zod';
import {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_SUBMISSION_TYPES,
} from '../../../config/security.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createAssignmentSchema = z
  .object({
    title: z.string().min(3).max(200),
    slug: z.string().min(2).max(120).optional(),
    instructions: z.string().min(1).max(20000),
    courseId: objectId,
    topicId: objectId.nullable().optional(),
    lessonId: objectId.nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    maximumMarks: z.number().min(0),
    allowedFileTypes: z.array(z.string().min(1).max(20)).max(20).optional(),
    maximumFileSizeBytes: z.number().int().min(1).max(100 * 1024 * 1024).optional(),
    submissionType: z.enum(ASSIGNMENT_SUBMISSION_TYPES),
    allowLateSubmission: z.boolean().optional(),
    allowResubmission: z.boolean().optional(),
    maxSubmissions: z.number().int().min(1).max(20).optional(),
  })
  .strict();

export const updateAssignmentSchema = createAssignmentSchema
  .omit({ courseId: true })
  .partial()
  .strict();

export const assignmentStatusSchema = z
  .object({
    status: z.enum(Object.values(ASSIGNMENT_STATUS)),
  })
  .strict();

export const assignmentIdParamSchema = z.object({ id: objectId }).strict();

export const listAssignmentsQuerySchema = z
  .object({
    search: z.string().max(200).optional(),
    courseId: objectId.optional(),
    lessonId: objectId.optional(),
    status: z.enum(Object.values(ASSIGNMENT_STATUS)).optional(),
    dueBefore: z.string().optional(),
    dueAfter: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sortBy: z.enum(['createdAt', 'dueDate', 'title', 'status', 'maximumMarks']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .strict();

export const studentListQuerySchema = z
  .object({
    courseId: objectId.optional(),
    filter: z
      .enum(['upcoming', 'past_due', 'submitted', 'pending_evaluation', 'evaluated'])
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
