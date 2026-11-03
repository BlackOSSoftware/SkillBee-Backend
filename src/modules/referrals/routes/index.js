import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { publicFormRateLimiter } from '../../../middleware/rateLimiters.js';
import { validateRequest } from '../../../middleware/validate.js';
import { REFERRAL_STATUS } from '../../../models/Referral.js';
import { objectId } from '../../courses/validators/common.js';
import * as service from '../services/referral.service.js';

const phone = z.string().trim().regex(/^[+]?[\d\s\-()]{7,20}$/);
const submitBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email(),
    phone,
    friendName: z.string().trim().min(2).max(120),
    friendPhone: phone,
    message: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .strict();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(Object.values(REFERRAL_STATUS)).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export function mountReferralRoutes(app, apiPrefix) {
  const pub = Router();
  pub.post(
    '/',
    publicFormRateLimiter,
    validateRequest({ body: submitBody }),
    async (req, res, next) => {
      try {
        const data = await service.submitReferral(req.body);
        res.status(201).json({
          success: true,
          data: { message: 'Referral submitted successfully', ...data },
        });
      } catch (err) {
        next(err);
      }
    }
  );
  app.use(`${apiPrefix}/public/referrals`, pub);

  const admin = Router();
  admin.use(authenticate, requireAdminAccess());
  admin.get('/', validateRequest({ query: listQuery }), async (req, res, next) => {
    try {
      const result = await service.listReferrals(req.query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  });
  admin.get('/:id', validateRequest({ params: z.object({ id: objectId }) }), async (req, res, next) => {
    try {
      const doc = await service.getReferral(req.params.id);
      res.json({ success: true, data: doc.toAdminObject() });
    } catch (err) {
      next(err);
    }
  });
  admin.patch(
    '/:id/status',
    validateRequest({
      params: z.object({ id: objectId }),
      body: z
        .object({
          status: z.enum(Object.values(REFERRAL_STATUS)),
          adminNotes: z.string().max(5000).optional(),
        })
        .strict(),
    }),
    async (req, res, next) => {
      try {
        const data = await service.updateReferralStatus(req, req.params.id, req.body);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  admin.delete('/:id', validateRequest({ params: z.object({ id: objectId }) }), async (req, res, next) => {
    try {
      const data = await service.deleteReferral(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  app.use(`${apiPrefix}/admin/referrals`, admin);
}
