import { z } from 'zod';
import { ATTEMPT_STATUS } from '../../../config/security.js';
import { objectId } from './quiz.validator.js';

const answerPayloadSchema = z
  .object({
    selectedOptionIds: z.array(z.string()).optional(),
    booleanAnswer: z.boolean().optional(),
    answer: z.boolean().optional(),
    text: z.string().max(20000).optional(),
    blankAnswers: z
      .array(
        z
          .object({
            blankId: z.string().min(1),
            value: z.string().max(2000),
          })
          .strict()
      )
      .optional(),
  })
  .strict();

export const submitAttemptSchema = z
  .object({
    answers: z
      .array(
        z
          .object({
            questionId: objectId,
            answer: answerPayloadSchema,
          })
          .strict()
      )
      .default([]),
  })
  .strict()
  .refine(
    (data) => {
      const forbidden = [
        'obtainedMarks',
        'percentage',
        'passed',
        'negativeMarks',
        'totalMarks',
        'timeTakenSeconds',
        'status',
      ];
      return !forbidden.some((k) => Object.prototype.hasOwnProperty.call(data, k));
    },
    { message: 'Student cannot submit scoring fields' }
  );

export const attemptIdParamSchema = z.object({ id: objectId }).strict();

export const gradeAttemptSchema = z
  .object({
    grades: z
      .array(
        z
          .object({
            questionId: objectId,
            marksAwarded: z.number().min(0),
            feedback: z.string().max(5000).optional(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

export const listAttemptsQuerySchema = z
  .object({
    quizId: objectId.optional(),
    courseId: objectId.optional(),
    studentId: objectId.optional(),
    status: z.enum(ATTEMPT_STATUS).optional(),
    passed: z
      .union([z.literal('true'), z.literal('false'), z.boolean()])
      .optional()
      .transform((v) => {
        if (v === undefined) return undefined;
        if (v === true || v === 'true') return true;
        if (v === false || v === 'false') return false;
        return undefined;
      }),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sortBy: z.enum(['createdAt', 'submittedAt', 'percentage', 'attemptNumber']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .strict();
