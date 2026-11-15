import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../middleware/authenticate.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as ctrl from '../controllers/studentEnrollment.controller.js';
import {
  completeLessonBody,
  lessonIdParams,
  myCoursesQuery,
  selfEnrollBody,
} from '../validators/enrollment.validator.js';

const courseIdParam = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId'),
});

export const studentCoursesRouter = Router();
studentCoursesRouter.use(authenticate);
studentCoursesRouter.get('/my-courses', validateRequest({ query: myCoursesQuery }), ctrl.myCourses);
studentCoursesRouter.post(
  '/enrollments',
  validateRequest({ body: selfEnrollBody }),
  ctrl.enrollFree
);
studentCoursesRouter.get('/dashboard', ctrl.dashboard);
studentCoursesRouter.get(
  '/courses/:id/progress',
  validateRequest({ params: courseIdParam }),
  ctrl.courseProgress
);

export const studentLessonProgressRouter = Router();
studentLessonProgressRouter.use(authenticate);
studentLessonProgressRouter.post(
  '/:id/complete',
  validateRequest({ params: lessonIdParams, body: completeLessonBody }),
  ctrl.completeLessonHandler
);
