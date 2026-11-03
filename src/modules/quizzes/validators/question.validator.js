import { z } from 'zod';
import { QUESTION_TYPES } from '../../../config/security.js';
import { objectId } from './quiz.validator.js';

const optionSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    text: z.string().min(1).max(2000),
    image: z.string().max(2000).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();

const blankSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    acceptedAnswers: z.array(z.string().min(1).max(500)).min(1),
    caseSensitive: z.boolean().optional(),
    marks: z.number().min(0),
  })
  .strict();

const rubricSchema = z
  .object({
    criterion: z.string().min(1).max(500),
    maximumMarks: z.number().min(0),
    description: z.string().max(2000).optional(),
  })
  .strict();

export const createQuestionSchema = z
  .object({
    questionText: z.string().min(1).max(5000),
    questionType: z.enum(QUESTION_TYPES),
    description: z.string().max(5000).optional(),
    marks: z.number().min(0),
    negativeMarks: z.number().min(0).optional(),
    sortOrder: z.number().int().min(0).optional(),
    isRequired: z.boolean().optional(),
    explanation: z.string().max(5000).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    tags: z.array(z.string().max(50)).max(30).optional(),
    options: z.array(optionSchema).optional(),
    correctOptionIds: z.array(z.string()).optional(),
    correctAnswer: z.boolean().optional(),
    acceptedAnswers: z.array(z.string().min(1).max(500)).optional(),
    answerMatchingMode: z.enum(['exact', 'case_insensitive', 'normalized']).optional(),
    gradingRubric: z.array(rubricSchema).optional(),
    blanks: z.array(blankSchema).optional(),
    questionBankId: objectId.optional(),
  })
  .strict();

export const updateQuestionSchema = createQuestionSchema.partial().strict();

export const questionIdParamSchema = z.object({ questionId: objectId }).strict();

export const quizQuestionParamSchema = z
  .object({
    quizId: objectId,
  })
  .strict();

export const bankCreateSchema = createQuestionSchema
  .extend({
    defaultMarks: z.number().min(0).optional(),
    category: z.string().max(100).optional(),
    marks: z.number().min(0).optional(),
  })
  .strict();

export const bankUpdateSchema = bankCreateSchema.partial().strict();

export const bankIdParamSchema = z.object({ id: objectId }).strict();

export const listBankQuerySchema = z
  .object({
    search: z.string().max(200).optional(),
    questionType: z.enum(QUESTION_TYPES).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    tags: z.string().optional(),
    tag: z.string().optional(),
    category: z.string().max(100).optional(),
    status: z.enum(['active', 'archived']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const fromBankSchema = z
  .object({
    questionBankIds: z.array(objectId).min(1).max(50),
  })
  .strict();
