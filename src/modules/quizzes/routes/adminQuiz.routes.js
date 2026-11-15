import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAnyPermission } from '../../../middleware/authorize.js';
import { validate, validateRequest } from '../../../middleware/validate.js';
import { PERMISSIONS } from '../../../config/security.js';
import * as quizController from '../controllers/quiz.controller.js';
import * as attemptController from '../controllers/quizAttempt.controller.js';
import {
  createQuizSchema,
  listQuizzesQuerySchema,
  quizIdParamSchema,
  quizStatusSchema,
  reorderQuestionsSchema,
  updateQuizSchema,
} from '../validators/quiz.validator.js';
import {
  createQuestionSchema,
  fromBankSchema,
  questionIdParamSchema,
  updateQuestionSchema,
} from '../validators/question.validator.js';
import {
  attemptIdParamSchema,
  gradeAttemptSchema,
  listAttemptsQuerySchema,
} from '../validators/quizAttempt.validator.js';

const router = Router();

// authenticate only — per-route requireAnyPermission enforces access.
router.use(authenticate);

router.get(
  '/',
  requireAnyPermission(PERMISSIONS.QUIZZES_READ),
  validate(listQuizzesQuerySchema, 'query'),
  quizController.listQuizzes
);

router.post(
  '/',
  requireAnyPermission(PERMISSIONS.QUIZZES_CREATE),
  validate(createQuizSchema),
  quizController.createQuiz
);

router.patch(
  '/questions/:questionId',
  requireAnyPermission(PERMISSIONS.QUIZZES_QUESTIONS_MANAGE),
  validateRequest({ params: questionIdParamSchema, body: updateQuestionSchema }),
  quizController.updateQuestion
);

router.delete(
  '/questions/:questionId',
  requireAnyPermission(PERMISSIONS.QUIZZES_QUESTIONS_MANAGE),
  validateRequest({ params: questionIdParamSchema }),
  quizController.deleteQuestion
);

router.get(
  '/:id',
  requireAnyPermission(PERMISSIONS.QUIZZES_READ),
  validateRequest({ params: quizIdParamSchema }),
  quizController.getQuiz
);

router.patch(
  '/:id',
  requireAnyPermission(PERMISSIONS.QUIZZES_UPDATE),
  validateRequest({ params: quizIdParamSchema, body: updateQuizSchema }),
  quizController.updateQuiz
);

router.delete(
  '/:id',
  requireAnyPermission(PERMISSIONS.QUIZZES_DELETE),
  validateRequest({ params: quizIdParamSchema }),
  quizController.deleteQuiz
);

router.patch(
  '/:id/status',
  requireAnyPermission(PERMISSIONS.QUIZZES_PUBLISH),
  validateRequest({ params: quizIdParamSchema, body: quizStatusSchema }),
  quizController.changeStatus
);

router.post(
  '/:id/duplicate',
  requireAnyPermission(PERMISSIONS.QUIZZES_CREATE),
  validateRequest({ params: quizIdParamSchema }),
  quizController.duplicateQuiz
);

router.get(
  '/:id/questions',
  requireAnyPermission(PERMISSIONS.QUIZZES_QUESTIONS_MANAGE, PERMISSIONS.QUIZZES_READ),
  validateRequest({ params: quizIdParamSchema }),
  quizController.listQuestions
);

router.post(
  '/:id/questions',
  requireAnyPermission(PERMISSIONS.QUIZZES_QUESTIONS_MANAGE),
  validateRequest({ params: quizIdParamSchema, body: createQuestionSchema }),
  quizController.addQuestion
);

router.post(
  '/:id/questions/from-bank',
  requireAnyPermission(PERMISSIONS.QUIZZES_QUESTIONS_MANAGE),
  validateRequest({ params: quizIdParamSchema, body: fromBankSchema }),
  quizController.addFromBank
);

router.patch(
  '/:id/questions/reorder',
  requireAnyPermission(PERMISSIONS.QUIZZES_QUESTIONS_MANAGE),
  validateRequest({ params: quizIdParamSchema, body: reorderQuestionsSchema }),
  quizController.reorderQuestions
);

router.get(
  '/:id/attempts',
  requireAnyPermission(PERMISSIONS.QUIZZES_ATTEMPTS_READ),
  validateRequest({
    params: quizIdParamSchema,
    query: listAttemptsQuerySchema,
  }),
  quizController.listAttempts
);

router.get(
  '/:id/analytics',
  requireAnyPermission(PERMISSIONS.QUIZZES_ANALYTICS_READ),
  validateRequest({ params: quizIdParamSchema }),
  quizController.getAnalytics
);

export default router;

export const adminAttemptRouter = Router();
// authenticate only — per-route requireAnyPermission enforces access.
adminAttemptRouter.use(authenticate);

adminAttemptRouter.get(
  '/',
  requireAnyPermission(PERMISSIONS.QUIZZES_ATTEMPTS_READ),
  validate(listAttemptsQuerySchema, 'query'),
  attemptController.listAdmin
);

adminAttemptRouter.get(
  '/:id',
  requireAnyPermission(PERMISSIONS.QUIZZES_ATTEMPTS_READ, PERMISSIONS.QUIZZES_RESULTS_READ),
  validateRequest({ params: attemptIdParamSchema }),
  attemptController.getAdmin
);

adminAttemptRouter.get(
  '/:id/result',
  requireAnyPermission(PERMISSIONS.QUIZZES_RESULTS_READ),
  validateRequest({ params: attemptIdParamSchema }),
  attemptController.getAdmin
);

adminAttemptRouter.get(
  '/:id/grading',
  requireAnyPermission(PERMISSIONS.QUIZZES_GRADE),
  validateRequest({ params: attemptIdParamSchema }),
  attemptController.gradingView
);

adminAttemptRouter.patch(
  '/:id/grade',
  requireAnyPermission(PERMISSIONS.QUIZZES_GRADE),
  validateRequest({ params: attemptIdParamSchema, body: gradeAttemptSchema }),
  attemptController.grade
);
