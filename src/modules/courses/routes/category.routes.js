import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requirePermissions, requireAdminAccess } from '../../../middleware/authorize.js';
import { validate, validateRequest } from '../../../middleware/validate.js';
import { PERMISSIONS } from '../../../config/security.js';
import * as categoryController from '../controllers/category.controller.js';
import {
  categoryIdParamSchema,
  categoryStatusSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  reorderCategoriesSchema,
  updateCategorySchema,
} from '../validators/category.validator.js';

const router = Router();

router.use(authenticate, requireAdminAccess(), requirePermissions(PERMISSIONS.CATEGORIES_MANAGE));

router.get('/', validate(listCategoriesQuerySchema, 'query'), categoryController.listCategories);
router.post('/', validate(createCategorySchema), categoryController.createCategory);
router.patch('/reorder', validate(reorderCategoriesSchema), categoryController.reorder);
router.get(
  '/:id',
  validateRequest({ params: categoryIdParamSchema }),
  categoryController.getCategory
);
router.patch(
  '/:id',
  validateRequest({ params: categoryIdParamSchema, body: updateCategorySchema }),
  categoryController.updateCategory
);
router.delete(
  '/:id',
  validateRequest({ params: categoryIdParamSchema }),
  categoryController.deleteCategory
);
router.patch(
  '/:id/status',
  validateRequest({ params: categoryIdParamSchema, body: categoryStatusSchema }),
  categoryController.updateStatus
);
router.get(
  '/:id/courses',
  validateRequest({ params: categoryIdParamSchema }),
  categoryController.listCategoryCourses
);

export default router;
