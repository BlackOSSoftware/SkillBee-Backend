import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { validateRequest } from '../../../middleware/validate.js';
import { quizStartRateLimiter, quizSubmitRateLimiter } from '../../../middleware/rateLimiters.js';
import * as attemptController from '../controllers/quizAttempt.controller.js';
import { quizIdParamSchema } from '../validators/quiz.validator.js';
import {
  attemptIdParamSchema,
  submitAttemptSchema,
} from '../validators/quizAttempt.validator.js';

const studentQuizRouter = Router();
studentQuizRouter.use(authenticate);

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
