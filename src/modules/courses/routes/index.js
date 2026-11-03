import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireCourseStaffAccess } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import adminCourseRoutes, { reviewModerationRouter } from './adminCourse.routes.js';
import categoryRoutes from './category.routes.js';
import instructorRoutes from './instructor.routes.js';
import lessonRoutes from './lesson.routes.js';
import { adminResourceRouter } from './resource.routes.js';
import { topicAdminRouter } from './curriculum.routes.js';
import publicCourseRoutes, { publicCategoryRouter } from './publicCourse.routes.js';
import learningRoutes from './learning.routes.js';
import * as reviewController from '../controllers/review.controller.js';
import {
  courseReviewParamSchema,
  createReviewBody,
  updateReviewBody,
} from '../validators/review.validator.js';
import { z } from 'zod';
import { objectId } from '../validators/common.js';

export function mountCourseRoutes(app, apiPrefix) {
  app.use(`${apiPrefix}/admin/courses`, adminCourseRoutes);
  app.use(`${apiPrefix}/admin/course-categories`, categoryRoutes);
  app.use(`${apiPrefix}/admin/instructors`, instructorRoutes);
  app.use(`${apiPrefix}/admin/reviews`, reviewModerationRouter);

  const studentCourseReviews = Router({ mergeParams: true });
  studentCourseReviews.use(authenticate);
  studentCourseReviews.post(
    '/',
    validateRequest({ params: courseReviewParamSchema, body: createReviewBody }),
    reviewController.createStudentReview
  );
  app.use(`${apiPrefix}/student/courses/:id/reviews`, studentCourseReviews);

  const studentReviews = Router();
  studentReviews.use(authenticate);
  studentReviews.patch(
    '/:id',
    validateRequest({
      params: z.object({ id: objectId }),
      body: updateReviewBody,
    }),
    reviewController.updateStudentReview
  );
  app.use(`${apiPrefix}/student/reviews`, studentReviews);

  const adminLessonMount = Router();
  adminLessonMount.use(authenticate, requireCourseStaffAccess());
  adminLessonMount.use(topicAdminRouter);
  adminLessonMount.use(lessonRoutes);
  adminLessonMount.use(adminResourceRouter);
  app.use(`${apiPrefix}/admin`, adminLessonMount);

  app.use(`${apiPrefix}/courses`, publicCourseRoutes);
  app.use(`${apiPrefix}/course-categories`, publicCategoryRouter);
  app.use(`${apiPrefix}/learning`, learningRoutes);
}
