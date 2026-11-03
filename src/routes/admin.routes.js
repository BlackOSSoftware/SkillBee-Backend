import { Router } from 'express';
import * as usersController from '../controllers/users.controller.js';
import * as rolesController from '../controllers/roles.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdminAccess, requirePermissions } from '../middleware/authorize.js';
import { validate, validateRequest } from '../middleware/validate.js';
import { PERMISSIONS } from '../config/security.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  updateUserStatusSchema,
  userIdParamSchema,
} from '../validators/user.validators.js';
import {
  assignPermissionsSchema,
  createRoleSchema,
  roleIdParamSchema,
  updateRoleSchema,
} from '../validators/role.validators.js';

const router = Router();

// Scope admin auth to these sub-routers only — do not block /admin/courses/* etc.
const usersRouter = Router();
usersRouter.use(authenticate, requireAdminAccess());

usersRouter.get(
  '/',
  requirePermissions(PERMISSIONS.USERS_READ),
  validate(listUsersQuerySchema, 'query'),
  usersController.listUsers
);

usersRouter.post(
  '/',
  requirePermissions(PERMISSIONS.USERS_WRITE),
  validate(createUserSchema),
  usersController.createUser
);

usersRouter.get(
  '/:id',
  requirePermissions(PERMISSIONS.USERS_READ),
  validateRequest({ params: userIdParamSchema }),
  usersController.getUser
);

usersRouter.patch(
  '/:id',
  requirePermissions(PERMISSIONS.USERS_WRITE),
  validateRequest({ params: userIdParamSchema, body: updateUserSchema }),
  usersController.updateUser
);

usersRouter.delete(
  '/:id',
  requirePermissions(PERMISSIONS.USERS_DELETE),
  validateRequest({ params: userIdParamSchema }),
  usersController.deleteUser
);

usersRouter.patch(
  '/:id/status',
  requirePermissions(PERMISSIONS.USERS_WRITE),
  validateRequest({ params: userIdParamSchema, body: updateUserStatusSchema }),
  usersController.updateUserStatus
);

const rolesRouter = Router();
rolesRouter.use(authenticate, requireAdminAccess());

rolesRouter.get('/', requirePermissions(PERMISSIONS.ROLES_READ), rolesController.listRoles);
rolesRouter.post(
  '/',
  requirePermissions(PERMISSIONS.ROLES_WRITE),
  validate(createRoleSchema),
  rolesController.createRole
);
rolesRouter.patch(
  '/:id',
  requirePermissions(PERMISSIONS.ROLES_WRITE),
  validateRequest({ params: roleIdParamSchema, body: updateRoleSchema }),
  rolesController.updateRole
);
rolesRouter.delete(
  '/:id',
  requirePermissions(PERMISSIONS.ROLES_DELETE),
  validateRequest({ params: roleIdParamSchema }),
  rolesController.deleteRole
);
rolesRouter.patch(
  '/:id/permissions',
  requirePermissions(PERMISSIONS.PERMISSIONS_ASSIGN),
  validateRequest({ params: roleIdParamSchema, body: assignPermissionsSchema }),
  rolesController.assignPermissions
);

const permissionsRouter = Router();
permissionsRouter.use(authenticate, requireAdminAccess());
permissionsRouter.get(
  '/',
  requirePermissions(PERMISSIONS.PERMISSIONS_READ),
  rolesController.listPermissions
);

const systemRouter = Router();
systemRouter.use(authenticate, requireAdminAccess());
systemRouter.get('/cache-metrics', async (_req, res, next) => {
  try {
    const { getCacheMetrics, redisHealthCheck } = await import('../config/redis.js');
    const health = await redisHealthCheck();
    res.json({
      success: true,
      data: {
        metrics: getCacheMetrics(),
        redis: health,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.use('/users', usersRouter);
router.use('/roles', rolesRouter);
router.use('/permissions', permissionsRouter);
router.use('/system', systemRouter);

export default router;
