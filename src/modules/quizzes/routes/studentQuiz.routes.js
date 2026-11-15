import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../middleware/authenticate.js';
import { validateRequest } from '../../../middleware/validate.js';
import { quizStartRateLimiter, quizSubmitRateLimiter } from '../../../middleware/rateLimiters.js';
import * as attemptController from '../controllers/quizAttempt.controller.js';
import { objectId, quizIdParamSchema } from '../validators/quiz.validator.js';
import {
  attemptIdParamSchema,
  submitAttemptSchema,
} from '../validators/quizAttempt.validator.js';

const studentListQuizzesQuerySchema = z
  .object({
    search: z.string().max(200).optional(),
    courseId: objectId.optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

const studentQuizRouter = Router();
studentQuizRouter.use(authenticate);

studentQuizRouter.get(
  '/',
  validateRequest({ query: studentListQuizzesQuerySchema }),
  attemptController.listStudentQuizzes
);

studentQuizRouter.get(
  '/:id',
  validateRequest({ params: quizIdParamSchema }),
  attemptController.getStudentQuiz
);

studentQuizRouter.post(
  '/:id/start',
  quizStartRateLimiter,
  validateRequest({ params: quizIdParamSchema }),
  attemptController.start
);

const studentAttemptRouter = Router();
studentAttemptRouter.use(authenticate);

studentAttemptRouter.post(
  '/:id/submit',
  quizSubmitRateLimiter,
  validateRequest({ params: attemptIdParamSchema, body: submitAttemptSchema }),
  attemptController.submit
);

studentAttemptRouter.get(
  '/:id/result',
  validateRequest({ params: attemptIdParamSchema }),
  attemptController.studentResult
);

export { studentQuizRouter, studentAttemptRouter };
