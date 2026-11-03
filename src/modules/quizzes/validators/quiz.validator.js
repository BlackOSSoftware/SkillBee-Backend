import { z } from 'zod';
import { QUIZ_SHOW_RESULTS, QUIZ_STATUS } from '../../../config/security.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const availabilitySchema = z
  .object({
    enabled: z.boolean().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    timezone: z.string().max(64).optional(),
  })
  .strict()
  .optional();

export const createQuizSchema = z
  .object({
    title: z.string().min(3).max(200),
    slug: z.string().min(2).max(120).optional(),
    description: z.string().max(5000).optional(),
    instructions: z.string().max(10000).optional(),
    courseId: objectId,
    topicId: objectId.nullable().optional(),
    lessonId: objectId.nullable().optional(),
    timeLimitSeconds: z.number().int().min(0).optional(),
    passingPercentage: z.number().min(0).max(100).optional(),
    maximumAttempts: z.number().int().min(0).nullable().optional(),
    randomizeQuestions: z.boolean().optional(),
    randomizeAnswers: z.boolean().optional(),
    showResults: z.enum(QUIZ_SHOW_RESULTS).optional(),
    showCorrectAnswers: z.boolean().optional(),
    showExplanation: z.boolean().optional(),
    negativeMarkingEnabled: z.boolean().optional(),
    negativeMarksPerWrongAnswer: z.number().min(0).optional(),
    allowResume: z.boolean().optional(),
    allowBackNavigation: z.boolean().optional(),
    requireAllQuestions: z.boolean().optional(),
    allowPartialCreditMultiSelect: z.boolean().optional(),
    questionSelectionMode: z.enum(['all', 'random_count']).optional(),
    questionsToSelect: z.number().int().min(1).nullable().optional(),
    tags: z.array(z.string().max(50)).max(30).optional(),
    availability: availabilitySchema,
  })
  .strict();

export const updateQuizSchema = createQuizSchema
  .omit({ courseId: true })
  .partial()
  .strict();

export const quizStatusSchema = z
  .object({
    status: z.enum([QUIZ_STATUS.DRAFT, QUIZ_STATUS.PUBLISHED, QUIZ_STATUS.ARCHIVED]),
  })
  .strict();

export const quizIdParamSchema = z.object({ id: objectId }).strict();

export const listQuizzesQuerySchema = z
  .object({
    search: z.string().max(200).optional(),
    courseId: objectId.optional(),
    lessonId: objectId.optional(),
    status: z.enum(Object.values(QUIZ_STATUS)).optional(),
    createdBy: objectId.optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sortBy: z.enum(['createdAt', 'title', 'status', 'totalMarks']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .strict();

export const reorderQuestionsSchema = z
  .object({
    questionIds: z.array(objectId).min(1),
  })
  .strict();
