import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { publicFormRateLimiter } from '../../../middleware/rateLimiters.js';
import { validateRequest } from '../../../middleware/validate.js';
import { NEWSLETTER_STATUS } from '../../../models/NewsletterSubscriber.js';
import { objectId } from '../../courses/validators/common.js';
import * as service from '../services/newsletter.service.js';

const emailBody = z.object({ email: z.string().trim().email() }).strict();
const verifyQuery = z.object({
  email: z.string().trim().email(),
  token: z.string().trim().min(16).max(200),
});
const unsubBody = z
  .object({
    email: z.string().trim().email(),
    token: z.string().trim().min(16).max(200),
  })
  .strict();
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(Object.values(NEWSLETTER_STATUS)).optional(),
});
const campaignBody = z
  .object({
    subject: z.string().trim().min(1).max(200),
    htmlBody: z.string().min(1).max(100000),
    textBody: z.string().min(1).max(50000),
  })
  .strict();

export function mountNewsletterRoutes(app, apiPrefix) {
  const pub = Router();
  pub.post(
    '/subscribe',
    publicFormRateLimiter,
    validateRequest({ body: emailBody }),
    async (req, res, next) => {
      try {
        const data = await service.subscribe(req.body.email);
        res.status(201).json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  pub.get('/verify', publicFormRateLimiter, validateRequest({ query: verifyQuery }), async (req, res, next) => {
    try {
      const data = await service.verify(req.query.email, req.query.token);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  pub.post(
    '/unsubscribe',
    publicFormRateLimiter,
    validateRequest({ body: unsubBody }),
    async (req, res, next) => {
      try {
        const data = await service.unsubscribe(req.body);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  app.use(`${apiPrefix}/public/newsletter`, pub);

  const admin = Router();
  admin.use(authenticate, requireAdminAccess());
  admin.get('/subscribers', validateRequest({ query: listQuery }), async (req, res, next) => {
    try {
      const result = await service.listSubscribers(req.query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  });
  admin.get(
    '/subscribers/:id',
    validateRequest({ params: z.object({ id: objectId }) }),
    async (req, res, next) => {
      try {
        const data = await service.getSubscriber(req.params.id);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  admin.patch(
    '/subscribers/:id/status',
    validateRequest({
      params: z.object({ id: objectId }),
      body: z.object({ status: z.enum(Object.values(NEWSLETTER_STATUS)) }).strict(),
    }),
    async (req, res, next) => {
      try {
        const data = await service.setSubscriberStatus(req.params.id, req.body.status);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  admin.delete(
    '/subscribers/:id',
    validateRequest({ params: z.object({ id: objectId }) }),
    async (req, res, next) => {
      try {
        const data = await service.deleteSubscriber(req.params.id);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  admin.post('/campaigns', validateRequest({ body: campaignBody }), async (req, res, next) => {
    try {
      const data = await service.createAndSendCampaign(req, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  admin.get('/campaigns', validateRequest({ query: listQuery }), async (req, res, next) => {
    try {
      const result = await service.listCampaigns(req.query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  });
  admin.get(
    '/campaigns/:id',
    validateRequest({ params: z.object({ id: objectId }) }),
    async (req, res, next) => {
      try {
        const data = await service.getCampaign(req.params.id);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  app.use(`${apiPrefix}/admin/newsletter`, admin);
}
