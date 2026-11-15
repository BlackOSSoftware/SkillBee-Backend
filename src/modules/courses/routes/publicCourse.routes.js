import { Router } from 'express';
import { optionalAuthenticate } from '../../../middleware/optionalAuthenticate.js';
import { publicFormRateLimiter } from '../../../middleware/rateLimiters.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as publicCourseController from '../controllers/publicCourse.controller.js';
import * as categoryController from '../controllers/category.controller.js';
import * as reviewController from '../controllers/review.controller.js';
import {
  courseReviewParamSchema,
  publicReviewListQuery,
} from '../validators/review.validator.js';
import {
  courseSlugParamSchema,
  freeRegistrationBody,
} from '../validators/course.validator.js';

const router = Router();

router.get('/featured', publicCourseController.listFeatured);
router.get('/categories', publicCourseController.listCategories);
router.get('/', publicCourseController.listCourses);
router.get(
  '/:id/reviews',
  validateRequest({ params: courseReviewParamSchema, query: publicReviewListQuery }),
  reviewController.listPublicReviews
);
router.get('/:slug/curriculum', optionalAuthenticate, publicCourseController.getCurriculum);
router.get('/:slug', optionalAuthenticate, publicCourseController.getBySlug);
// Public free-course registration — captures lead details; enrolls when the caller is a logged-in student.
router.post(
  '/:slug/free-registration',
  publicFormRateLimiter,
  optionalAuthenticate,
  validateRequest({ params: courseSlugParamSchema, body: freeRegistrationBody }),
  publicCourseController.registerFree
);

export const publicCategoryRouter = Router();
publicCategoryRouter.get('/', categoryController.listPublicCategories);

export default router;
