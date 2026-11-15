import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import {
  requireAdminAccess,
  requireAnyPermission,
} from '../../../middleware/authorize.js';
import { validate, validateRequest } from '../../../middleware/validate.js';
import { PERMISSIONS } from '../../../config/security.js';
import * as courseController from '../controllers/course.controller.js';
import * as analyticsController from '../controllers/courseAnalytics.controller.js';
import * as reviewController from '../controllers/review.controller.js';
import {
  assignInstructorsSchema,
  courseIdOnlyParamSchema,
  courseIdParamSchema,
  courseStatusSchema,
  createCourseSchema,
  listCoursesQuerySchema,
  reorderCoursesSchema,
  updateCourseSchema,
} from '../validators/course.validator.js';
import { objectId } from '../validators/common.js';
import {
  adminReviewListQuery,
  reviewStatusSchema,
} from '../validators/review.validator.js';
import curriculumRoutes from './curriculum.routes.js';
import resourceRoutes from './resource.routes.js';
import { z } from 'zod';

const router = Router();

// authenticate only — every route below enforces requireAnyPermission, so
// custom roles with course permissions work without a role-slug check.
router.use(authenticate);

router.get(
  '/',
  requireAnyPermission(PERMISSIONS.COURSES_READ, PERMISSIONS.INSTRUCTOR_COURSES_READ),
  validate(listCoursesQuerySchema, 'query'),
  courseController.listCourses
);

router.post(
  '/',
  requireAnyPermission(PERMISSIONS.COURSES_CREATE),
  validate(createCourseSchema),
  courseController.createCourse
);

router.get(
  '/:id',
  requireAnyPermission(PERMISSIONS.COURSES_READ, PERMISSIONS.INSTRUCTOR_COURSES_READ),
  validateRequest({ params: courseIdParamSchema }),
  courseController.getCourse
);

router.patch(
  '/:id',
  requireAnyPermission(PERMISSIONS.COURSES_UPDATE, PERMISSIONS.INSTRUCTOR_COURSES_UPDATE),
  validateRequest({ params: courseIdParamSchema, body: updateCourseSchema }),
  courseController.updateCourse
);

router.delete(
  '/:id',
  requireAnyPermission(PERMISSIONS.COURSES_DELETE),
  validateRequest({ params: courseIdParamSchema }),
  courseController.deleteCourse
);

router.patch(
  '/:id/status',
  requireAnyPermission(PERMISSIONS.COURSES_PUBLISH),
  validateRequest({ params: courseIdParamSchema, body: courseStatusSchema }),
  courseController.updateStatus
);

router.post(
  '/:id/duplicate',
  requireAnyPermission(PERMISSIONS.COURSES_DUPLICATE),
  validateRequest({ params: courseIdParamSchema }),
  courseController.duplicateCourse
);

router.get(
  '/:id/preview',
  requireAnyPermission(PERMISSIONS.COURSES_READ, PERMISSIONS.INSTRUCTOR_COURSES_READ),
  validateRequest({ params: courseIdParamSchema }),
  courseController.previewCourse
);

router.get(
  '/:id/students',
  requireAnyPermission(PERMISSIONS.COURSES_READ, PERMISSIONS.INSTRUCTOR_STUDENTS_READ),
  validateRequest({ params: courseIdParamSchema }),
  courseController.listStudents
);

router.get(
  '/:id/analytics',
  requireAnyPermission(
    PERMISSIONS.COURSES_ANALYTICS_READ,
    PERMISSIONS.INSTRUCTOR_COURSES_READ
  ),
  validateRequest({ params: courseIdParamSchema }),
  analyticsController.getAnalytics
);

router.patch(
  '/:id/reorder',
  requireAnyPermission(PERMISSIONS.COURSES_UPDATE),
  validateRequest({ params: courseIdParamSchema, body: reorderCoursesSchema }),
  courseController.reorderCourse
);

router.get(
  '/:courseId/instructors',
  requireAnyPermission(PERMISSIONS.COURSES_READ, PERMISSIONS.INSTRUCTOR_COURSES_READ),
  validateRequest({ params: courseIdOnlyParamSchema }),
  courseController.listInstructors
);

router.put(
  '/:courseId/instructors',
  requireAnyPermission(PERMISSIONS.COURSES_INSTRUCTORS_MANAGE),
  validateRequest({ params: courseIdOnlyParamSchema, body: assignInstructorsSchema }),
  courseController.replaceInstructors
);

router.get(
  '/:courseId/reviews',
  requireAnyPermission(PERMISSIONS.COURSES_REVIEWS_MANAGE, PERMISSIONS.INSTRUCTOR_REVIEWS_READ),
  reviewController.listReviews
);

router.use(curriculumRoutes);
router.use(resourceRoutes);

export default router;

export const reviewModerationRouter = Router();
reviewModerationRouter.use(authenticate, requireAdminAccess());
reviewModerationRouter.get(
  '/',
  validateRequest({ query: adminReviewListQuery }),
  reviewController.listAdminReviews
);
reviewModerationRouter.get(
  '/:id',
  validateRequest({ params: z.object({ id: objectId }) }),
  reviewController.getAdminReview
);
reviewModerationRouter.patch(
  '/:id/status',
  validateRequest({
    params: z.object({ id: objectId }),
    body: reviewStatusSchema,
  }),
  reviewController.moderateReview
);
reviewModerationRouter.delete(
  '/:id',
  validateRequest({ params: z.object({ id: objectId }) }),
  reviewController.deleteReview
);
