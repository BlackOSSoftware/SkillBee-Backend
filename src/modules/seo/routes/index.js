import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.js';
import { requireAdminAccess } from '../../../middleware/authorize.js';
import { validateRequest } from '../../../middleware/validate.js';
import * as seoController from '../controllers/seo.controller.js';
import {
  courseIdParam,
  courseSeoPatchBody,
  idParam,
  pageSeoPatchBody,
  redirectCreateBody,
  redirectListQuery,
  redirectUpdateBody,
  resolveQuery,
  seoSettingsPatchBody,
} from '../validators/seo.validator.js';
import { z } from 'zod';
import { objectId } from '../../courses/validators/common.js';

export function mountSeoRoutes(app, apiPrefix) {
  // Public crawl surfaces on website-style paths (proxy from Next.js / CDN to backend)
  app.get('/sitemap.xml', seoController.sitemapXml);
  app.get('/sitemap-index.xml', seoController.sitemapIndexXml);
  app.get('/robots.txt', seoController.robotsTxt);

  // Also under API prefix for environments that only expose /api
  app.get(`${apiPrefix}/sitemap.xml`, seoController.sitemapXml);
  app.get(`${apiPrefix}/sitemap-index.xml`, seoController.sitemapIndexXml);
  app.get(`${apiPrefix}/robots.txt`, seoController.robotsTxt);

  const publicSeo = Router();
  publicSeo.get(
    '/resolve',
    validateRequest({ query: resolveQuery }),
    seoController.resolveMetadata
  );
  publicSeo.get(
    '/http-redirect',
    validateRequest({ query: resolveQuery }),
    seoController.httpRedirect
  );
  app.use(`${apiPrefix}/seo`, publicSeo);

  const adminSeo = Router();
  adminSeo.use(authenticate, requireAdminAccess());

  adminSeo.get('/settings', seoController.getSettings);
  adminSeo.patch(
    '/settings',
    validateRequest({ body: seoSettingsPatchBody }),
    seoController.patchSettings
  );

  adminSeo.get(
    '/pages/:id',
    validateRequest({ params: idParam }),
    seoController.getPageSeo
  );
  adminSeo.patch(
    '/pages/:id',
    validateRequest({ params: idParam, body: pageSeoPatchBody }),
    seoController.patchPageSeo
  );

  adminSeo.get(
    '/courses/:id',
    validateRequest({ params: courseIdParam }),
    seoController.getCourseSeo
  );
  adminSeo.patch(
    '/courses/:id',
    validateRequest({ params: courseIdParam, body: courseSeoPatchBody }),
    seoController.patchCourseSeo
  );

  adminSeo.get(
    '/redirects',
    validateRequest({ query: redirectListQuery }),
    seoController.listRedirects
  );
  adminSeo.post(
    '/redirects',
    validateRequest({ body: redirectCreateBody }),
    seoController.createRedirect
  );
  adminSeo.patch(
    '/redirects/:id',
    validateRequest({
      params: z.object({ id: objectId }),
      body: redirectUpdateBody,
    }),
    seoController.updateRedirect
  );
  adminSeo.delete(
    '/redirects/:id',
    validateRequest({ params: z.object({ id: objectId }) }),
    seoController.deleteRedirect
  );

  app.use(`${apiPrefix}/admin/seo`, adminSeo);
}
