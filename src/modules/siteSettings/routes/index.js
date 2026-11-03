import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as controller from '../controllers/siteSettings.controller.js';
import { siteSettingsPatchBody } from '../validators/siteSettings.validator.js';

export function mountSiteSettingsRoutes(app, apiPrefix) {
  app.get(`${apiPrefix}/site-settings`, controller.getPublicSettings);

  const admin = Router();
  admin.use(authenticate, requireAdminAccess());
  admin.get('/', controller.getAdminSettings);
  admin.patch(
    '/',
    validateRequest({ body: siteSettingsPatchBody }),
    controller.patchSettings
  );
  app.use(`${apiPrefix}/admin/site-settings`, admin);
}
