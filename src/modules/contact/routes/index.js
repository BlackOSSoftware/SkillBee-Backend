import { Router } from 'express';
import { PERMISSIONS } from '../../../config/security.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { requirePermissions } from '../../../middleware/authorize.js';
import { publicFormRateLimiter } from '../../../middleware/rateLimiters.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as contactController from '../controllers/contact.controller.js';
import {
  adminEnquiryListQuery,
  adminTicketListQuery,
  createEnquiryBody,
  createTicketBody,
  enquiryNoteBody,
  enquiryReplyBody,
  enquiryStatusBody,
  idParam,
  studentTicketListQuery,
  ticketAssignBody,
  ticketNoteBody,
  ticketReplyBody,
  ticketStatusBody,
} from '../validators/contact.validator.js';

export function mountContactRoutes(app, apiPrefix) {
  // Public website contact form — rate limited, no auth.
  const publicEnquiries = Router();
  publicEnquiries.post(
    '/',
    publicFormRateLimiter,
    validateRequest({ body: createEnquiryBody }),
    contactController.createEnquiry
  );
  app.use(`${apiPrefix}/contact-enquiries`, publicEnquiries);

  // Student support tickets — any authenticated user manages only their own.
  const studentTickets = Router();
  studentTickets.use(authenticate);
  studentTickets.post(
    '/',
    validateRequest({ body: createTicketBody }),
    contactController.createTicket
  );
  studentTickets.get(
    '/',
    validateRequest({ query: studentTicketListQuery }),
    contactController.listMyTickets
  );
  studentTickets.get(
    '/:id',
    validateRequest({ params: idParam }),
    contactController.getMyTicket
  );
  studentTickets.post(
    '/:id/replies',
    validateRequest({ params: idParam, body: ticketReplyBody }),
    contactController.replyMyTicket
  );
  app.use(`${apiPrefix}/support/tickets`, studentTickets);

  // Admin: website enquiries. Read needs enquiries.read; mutations need enquiries.manage.
  const adminEnquiries = Router();
  adminEnquiries.use(authenticate, requirePermissions(PERMISSIONS.ENQUIRIES_READ));
  adminEnquiries.get(
    '/',
    validateRequest({ query: adminEnquiryListQuery }),
    contactController.listAdminEnquiries
  );
  adminEnquiries.get(
    '/:id',
    validateRequest({ params: idParam }),
    contactController.getAdminEnquiry
  );
  adminEnquiries.patch(
    '/:id/status',
    requirePermissions(PERMISSIONS.ENQUIRIES_MANAGE),
    validateRequest({ params: idParam, body: enquiryStatusBody }),
    contactController.updateEnquiryStatus
  );
  adminEnquiries.post(
    '/:id/replies',
    requirePermissions(PERMISSIONS.ENQUIRIES_MANAGE),
    validateRequest({ params: idParam, body: enquiryReplyBody }),
    contactController.addEnquiryReply
  );
  adminEnquiries.post(
    '/:id/notes',
    requirePermissions(PERMISSIONS.ENQUIRIES_MANAGE),
    validateRequest({ params: idParam, body: enquiryNoteBody }),
    contactController.addEnquiryNote
  );
  adminEnquiries.get(
    '/:id/history',
    validateRequest({ params: idParam }),
    contactController.getEnquiryHistory
  );
  app.use(`${apiPrefix}/admin/contact-enquiries`, adminEnquiries);

  // Admin: support tickets. Read needs enquiries.read; mutations need enquiries.manage.
  const adminTickets = Router();
  adminTickets.use(authenticate, requirePermissions(PERMISSIONS.ENQUIRIES_READ));
  adminTickets.get(
    '/',
    validateRequest({ query: adminTicketListQuery }),
    contactController.listAdminTickets
  );
  adminTickets.get(
    '/:id',
    validateRequest({ params: idParam }),
    contactController.getAdminTicket
  );
  adminTickets.post(
    '/:id/replies',
    requirePermissions(PERMISSIONS.ENQUIRIES_MANAGE),
    validateRequest({ params: idParam, body: ticketReplyBody }),
    contactController.replyAdminTicket
  );
  adminTickets.post(
    '/:id/notes',
    requirePermissions(PERMISSIONS.ENQUIRIES_MANAGE),
    validateRequest({ params: idParam, body: ticketNoteBody }),
    contactController.addTicketNote
  );
  adminTickets.patch(
    '/:id/status',
    requirePermissions(PERMISSIONS.ENQUIRIES_MANAGE),
    validateRequest({ params: idParam, body: ticketStatusBody }),
    contactController.updateTicketStatus
  );
  adminTickets.patch(
    '/:id/assign',
    requirePermissions(PERMISSIONS.ENQUIRIES_MANAGE),
    validateRequest({ params: idParam, body: ticketAssignBody }),
    contactController.assignTicket
  );
  adminTickets.get(
    '/:id/history',
    validateRequest({ params: idParam }),
    contactController.getTicketHistory
  );
  app.use(`${apiPrefix}/admin/support/tickets`, adminTickets);
}
