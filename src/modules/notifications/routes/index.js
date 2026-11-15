import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as controller from '../controllers/notification.controller.js';
import {
  adminNotificationBody,
  idParam,
  listQuery,
  registerDeviceBody,
} from '../validators/notification.validator.js';

export function mountNotificationRoutes(app, apiPrefix) {
  const devices = Router();
  devices.use(authenticate);
  devices.post(
    '/register',
    validateRequest({ body: registerDeviceBody }),
    controller.registerDevice
  );
  devices.get('/', controller.listDevices);
  devices.delete(
    '/:id',
    validateRequest({ params: idParam }),
    controller.removeDevice
  );
  app.use(`${apiPrefix}/student/devices`, devices);
  // Admin devices use same endpoints under /student/devices (authenticated any role)
  app.use(`${apiPrefix}/devices`, devices);

  const studentNotes = Router();
  studentNotes.use(authenticate);
  studentNotes.get(
    '/',
    validateRequest({ query: listQuery }),
    controller.listMyNotifications
  );
  app.use(`${apiPrefix}/student/notifications`, studentNotes);

  const notes = Router();
  notes.use(authenticate);
  notes.patch(
    '/read-all',
    controller.markAllRead
  );
  notes.patch(
    '/:id/read',
    validateRequest({ params: idParam }),
    controller.markRead
  );
  notes.delete(
    '/:id',
    validateRequest({ params: idParam }),
    controller.deleteNotification
  );
  app.use(`${apiPrefix}/notifications`, notes);

  const admin = Router();
  admin.use(authenticate, requireAdminAccess());
  admin.post(
    '/',
    validateRequest({ body: adminNotificationBody }),
    controller.createAdminNotification
  );
  admin.get(
    '/',
    validateRequest({ query: listQuery }),
    controller.listAdminNotifications
  );
  admin.get(
    '/campaigns',
    validateRequest({ query: listQuery }),
    controller.listCampaigns
  );
  admin.get(
    '/campaigns/:campaignId',
    controller.getCampaign
  );
  app.use(`${apiPrefix}/admin/notifications`, admin);
}
