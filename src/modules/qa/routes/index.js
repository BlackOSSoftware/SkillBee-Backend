import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as qaController from '../controllers/qa.controller.js';
import {
  adminQuestionListQuery,
  courseIdParam,
  createQuestionBody,
  createReplyBody,
  idParam,
  questionStatusBody,
  studentQuestionListQuery,
} from '../validators/qa.validator.js';

export function mountQaRoutes(app, apiPrefix) {
  const studentCourseQs = Router({ mergeParams: true });
  studentCourseQs.use(authenticate);
  studentCourseQs.post(
    '/',
    validateRequest({ params: courseIdParam, body: createQuestionBody }),
    qaController.createStudentQuestion
  );
  app.use(`${apiPrefix}/student/courses/:id/questions`, studentCourseQs);

  const studentQs = Router();
  studentQs.use(authenticate);
  studentQs.get(
    '/',
    validateRequest({ query: studentQuestionListQuery }),
    qaController.listStudentQuestions
  );
  studentQs.get(
    '/:id',
    validateRequest({ params: idParam }),
    qaController.getStudentQuestion
  );
  studentQs.post(
    '/:id/replies',
    validateRequest({ params: idParam, body: createReplyBody }),
    qaController.createStudentReply
  );
  app.use(`${apiPrefix}/student/questions`, studentQs);

  const adminQs = Router();
  adminQs.use(authenticate, requireAdminAccess());
  adminQs.get(
    '/',
    validateRequest({ query: adminQuestionListQuery }),
    qaController.listAdminQuestions
  );
  adminQs.get(
    '/:id',
    validateRequest({ params: idParam }),
    qaController.getAdminQuestion
  );
  adminQs.post(
    '/:id/replies',
    validateRequest({ params: idParam, body: createReplyBody }),
    qaController.createAdminReply
  );
  adminQs.patch(
    '/:id/status',
    validateRequest({ params: idParam, body: questionStatusBody }),
    qaController.updateQuestionStatus
  );
  adminQs.delete(
    '/:id',
    validateRequest({ params: idParam }),
    qaController.deleteQuestion
  );
  app.use(`${apiPrefix}/admin/questions-answers`, adminQs);
}
