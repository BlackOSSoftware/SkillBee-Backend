import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import {
  requireAnyPermission,
  requireCourseStaffAccess,
} from '../../../middleware/authorize.js';
import { validate, validateRequest } from '../../../middleware/validate.js';
import { PERMISSIONS } from '../../../config/security.js';
import * as bankController from '../controllers/questionBank.controller.js';
import {
  bankCreateSchema,
  bankIdParamSchema,
  bankUpdateSchema,
  listBankQuerySchema,
} from '../validators/question.validator.js';

const router = Router();

router.use(
  authenticate,
  requireCourseStaffAccess(),
  requireAnyPermission(PERMISSIONS.QUIZZES_QUESTION_BANK_MANAGE)
);

router.get('/categories', bankController.categories);

router.get('/', validate(listBankQuerySchema, 'query'), bankController.list);

router.post('/', validate(bankCreateSchema), bankController.create);

router.get(
  '/:id',
  validateRequest({ params: bankIdParamSchema }),
  bankController.getOne
);

router.patch(
  '/:id',
  validateRequest({ params: bankIdParamSchema, body: bankUpdateSchema }),
  bankController.update
);

router.delete(
  '/:id',
  validateRequest({ params: bankIdParamSchema }),
  bankController.remove
);

export default router;
