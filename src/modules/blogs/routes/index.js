import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import { BLOG_STATUS } from '../../../models/Blog.js';
import { objectId } from '../../courses/validators/common.js';
import * as service from '../services/blog.service.js';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(Object.values(BLOG_STATUS)).optional(),
  categoryId: objectId.optional(),
  categorySlug: z.string().optional(),
  tag: z.string().optional(),
  authorId: objectId.optional(),
  isFeatured: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

const createBody = z
  .object({
    title: z.string().trim().min(3).max(200),
    slug: z.string().trim().max(200).optional(),
    excerpt: z.string().trim().max(500).optional(),
    content: z.string().min(1).max(200000),
    featuredImage: z.record(z.unknown()).optional().nullable(),
    categoryIds: z.array(objectId).optional(),
    tags: z.array(z.string()).optional(),
    isFeatured: z.boolean().optional(),
    seo: z.record(z.unknown()).optional(),
  })
  .strict();

const seoBody = z
  .object({
    seoTitle: z.string().max(120).optional(),
    metaDescription: z.string().max(320).optional(),
    slug: z.string().max(200).optional(),
    canonicalUrl: z.string().max(1000).optional(),
    robotsIndex: z.boolean().optional(),
    robotsFollow: z.boolean().optional(),
    ogTitle: z.string().max(120).optional(),
    ogDescription: z.string().max(320).optional(),
    ogImage: z.string().max(1000).optional(),
    schemaType: z.string().max(80).optional(),
    schemaData: z.record(z.unknown()).optional(),
  })
  .strict();

export function mountBlogRoutes(app, apiPrefix) {
  const pub = Router();
  pub.get('/featured', validateRequest({ query: listQuery }), async (req, res, next) => {
    try {
      const result = await service.listFeaturedOnly(req.query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  });
  pub.get('/', validateRequest({ query: listQuery }), async (req, res, next) => {
    try {
      const result = await service.listPublicBlogs(req.query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  });
  pub.get('/:slug', async (req, res, next) => {
    try {
      const data = await service.getPublicBlogBySlug(req.params.slug);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  app.use(`${apiPrefix}/public/blogs`, pub);

  app.get(`${apiPrefix}/public/blog-categories`, async (_req, res, next) => {
    try {
      const data = await service.listPublicCategories();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  app.get(
    `${apiPrefix}/public/blog-categories/:slug/blogs`,
    validateRequest({ query: listQuery }),
    async (req, res, next) => {
      try {
        const result = await service.listPublicBlogs({
          ...req.query,
          categorySlug: req.params.slug,
        });
        res.json({ success: true, ...result });
      } catch (err) {
        next(err);
      }
    }
  );
  app.get(
    `${apiPrefix}/public/blog-tags/:tag/blogs`,
    validateRequest({ query: listQuery }),
    async (req, res, next) => {
      try {
        const result = await service.listPublicBlogs({ ...req.query, tag: req.params.tag });
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
      const result = await service.listAdminBlogs(req.query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  });
  admin.post('/', validateRequest({ body: createBody }), async (req, res, next) => {
    try {
      const data = await service.createBlog(req, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  admin.post(
    '/categories',
    validateRequest({
      body: z
        .object({
          name: z.string().min(2).max(120),
          slug: z.string().optional(),
          description: z.string().max(1000).optional(),
          status: z.enum(['draft', 'published']).optional(),
        })
        .strict(),
    }),
    async (req, res, next) => {
      try {
        const data = await service.createCategory(req.body);
        res.status(201).json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  admin.get('/:id', validateRequest({ params: z.object({ id: objectId }) }), async (req, res, next) => {
    try {
      const data = await service.getAdminBlog(req.params.id);
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
        const data = await service.updateBlog(req, req.params.id, req.body);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  admin.delete('/:id', validateRequest({ params: z.object({ id: objectId }) }), async (req, res, next) => {
    try {
      const data = await service.deleteBlog(req, req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  admin.patch(
    '/:id/status',
    validateRequest({
      params: z.object({ id: objectId }),
      body: z.object({ status: z.enum(Object.values(BLOG_STATUS)) }).strict(),
    }),
    async (req, res, next) => {
      try {
        const data = await service.setBlogStatus(req, req.params.id, req.body.status);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  admin.get(
    '/:id/seo',
    validateRequest({ params: z.object({ id: objectId }) }),
    async (req, res, next) => {
      try {
        const data = await service.getBlogSeo(req.params.id);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  admin.patch(
    '/:id/seo',
    validateRequest({ params: z.object({ id: objectId }), body: seoBody }),
    async (req, res, next) => {
      try {
        const data = await service.updateBlogSeo(req, req.params.id, req.body);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  admin.post(
    '/:id/preview',
    validateRequest({ params: z.object({ id: objectId }) }),
    async (req, res, next) => {
      try {
        const data = await service.createPreview(req, req.params.id);
        res.status(201).json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );
  app.use(`${apiPrefix}/admin/blogs`, admin);
}
