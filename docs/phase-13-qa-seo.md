# Phase 13 — Q&A + SEO (Completion Report)

## Q&A eligibility

Active learning enrollment via `findLearningEnrollment`. Students may only view/reply to their own questions. Resolved questions reject replies until reopened by admin.

**Unanswered** = `replyCount === 0`. **Answered** = `replyCount > 0` (independent of open/resolved).

## SEO metadata resolution

`GET /api/v1/seo/resolve?path=...` → redirect check → published course by slug → page SEO → 404. Merges global defaults. Draft/unpublished courses are never public.

## Redirects

Unique active `sourcePath`. Loop/chain detection. Same-origin external only unless `allowExternal`. Published course slug changes create automatic 301. Real HTTP redirects via `GET /api/v1/seo/http-redirect?path=...`.

## Sitemap / robots

`GET /sitemap.xml`, `GET /sitemap-index.xml`, `GET /robots.txt` (also under `/api/v1/...`). Published + indexable only; Redis-cached with invalidation.

## Next.js

See `docs/nextjs-seo-integration.md`. No frontend in this repo; SSR contract verified in `tests/seo.ssr.test.js`.
