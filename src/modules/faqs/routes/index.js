import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import { FAQ_STATUS } from '../../../models/Faq.js';
import { objectId } from '../../courses/validators/common.js';
import * as service from '../services/faq.service.js';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(Object.values(FAQ_STATUS)).optional(),
  category: z.string().optional(),
  relatedCourseId: objectId.optional(),
});

const createBody = z
  .object({
    question: z.string().trim().min(3).max(500),
    answer: z.string().trim().min(1).max(20000),
    category: z.string().trim().max(120).optional(),
    relatedCourseId: objectId.optional().nullable(),
    displayOrder: z.number().int().optional(),
    isFeatured: z.boolean().optional(),
  })
  .strict();

export function mountFaqRoutes(app, apiPrefix) {
  const pub = Router();
  pub.get('/', validateRequest({ query: listQuery }), async (req, res, next) => {
    try {
      const result = await service.listPublicFaqs(req.query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  });
  pub.get('/:id', validateRequest({ params: z.object({ id: objectId }) }), async (req, res, next) => {
    try {
      const data = await service.getPublicFaq(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  app.use(`${apiPrefix}/public/faqs`, pub);

  app.get(
    `${apiPrefix}/public/courses/:courseId/faqs`,
    validateRequest({
      params: z.object({ courseId: objectId }),
      query: listQuery,
    }),
    async (req, res, next) => {
      try {
        const result = await service.listCourseFaqs(req.params.courseId, req.query);
        res.json({ success: true, ...result });
      } catch (err) {
        next(err);
      }
    }
  );

  const admin = Router();
  admin.use(authenticate, requireAdminAccess());
  admin.get('/', validateRequest({ query: listQuery }), async (req, res, next) => {
    try {
      const result = await service.listAdminFaqs(req.query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  });
  admin.post('/', validateRequest({ body: createBody }), async (req, res, next) => {
    try {
      const data = await service.createFaq(req, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  admin.patch(
    '/reorder',
    validateRequest({
      body: z.object({ orderedIds: z.array(objectId).min(1).max(500) }).strict(),
    }),
    async (req, res, next) => {
      try {
        const data = await service.reorderFaqs(req, req.body.orderedIds);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  admin.get('/:id', validateRequest({ params: z.object({ id: objectId }) }), async (req, res, next) => {
    try {
      const data = await service.getAdminFaq(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  admin.patch(
    '/:id',
    validateRequest({ params: z.object({ id: objectId }), body: createBody.partial() }),
    async (req, res, next) => {
      try {
        const data = await service.updateFaq(req, req.params.id, req.body);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  admin.patch(
    '/:id/status',
    validateRequest({
      params: z.object({ id: objectId }),
      body: z.object({ status: z.enum(Object.values(FAQ_STATUS)) }).strict(),
    }),
    async (req, res, next) => {
      try {
        const data = await service.setFaqStatus(req, req.params.id, req.body.status);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  admin.delete('/:id', validateRequest({ params: z.object({ id: objectId }) }), async (req, res, next) => {
    try {
      const data = await service.deleteFaq(req, req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  app.use(`${apiPrefix}/admin/faqs`, admin);
}
