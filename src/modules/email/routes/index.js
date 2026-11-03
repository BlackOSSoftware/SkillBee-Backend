import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as controller from '../controllers/email.controller.js';
import {
  createTemplateBody,
  emailLogQuery,
  idParam,
  objectIdParam,
  templateStatusBody,
  updateTemplateBody,
} from '../validators/email.validator.js';

export function mountEmailRoutes(app, apiPrefix) {
  const templates = Router();
  templates.use(authenticate, requireAdminAccess());
  templates.get('/', controller.listTemplates);
  templates.post(
    '/',
    validateRequest({ body: createTemplateBody }),
    controller.createTemplate
  );
  templates.get(
    '/:id',
    validateRequest({ params: idParam }),
    controller.getTemplate
  );
  templates.patch(
    '/:id',
    validateRequest({ params: idParam, body: updateTemplateBody }),
    controller.updateTemplate
  );
  templates.patch(
    '/:id/status',
    validateRequest({ params: idParam, body: templateStatusBody }),
    controller.setTemplateStatus
  );
  app.use(`${apiPrefix}/admin/email-templates`, templates);

  const logs = Router();
  logs.use(authenticate, requireAdminAccess());
  logs.get('/', validateRequest({ query: emailLogQuery }), controller.listLogs);
  logs.get('/:id', validateRequest({ params: objectIdParam }), controller.getLog);
  app.use(`${apiPrefix}/admin/email-logs`, logs);
}
