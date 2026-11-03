# Phase 3 Implementation Report — Curriculum, Lessons, Video & Attachments

**Date:** 2026-11-02  
**Scope:** Backend only (no UI)

## Automated tests

```
npm test
# Auth API: 9/9
# Phase 2 Course Management: 4/4
# Phase 3 Curriculum / Lessons / Media: 4/4
# TOTAL: 17/17 PASS
```

## Live e2e

```
npm run e2e:curriculum
# PASSED — create course, 5 topics, lessons, reorder, move, PDF + video upload, archive, curriculum list
```

## Incomplete infrastructure

| Item | Status |
|------|--------|
| FFmpeg / HLS worker queue | **Not implemented** — set `VIDEO_HLS_ENABLED=true` to keep uploads `pending` until an external worker verifies HLS |
| Resumable / chunked video upload | **Not implemented** — single multipart stream only |
| WordPress content import fidelity | **Not claimed** — demo seed is native development data |

When `VIDEO_HLS_ENABLED=false` (default), uploaded source files are honestly marked `ready` for progressive playback with `availableQualities: ["source"]` and **no fabricated `.m3u8` paths**.

## Run locally

```bash
cd backend
cp .env.example .env   # configure MONGODB_URI + JWT secrets
npm install
npm run seed:roles
npm run seed:curriculum
npm run dev
# Docs: http://localhost:5000/api/v1/docs
npm test
```

## Run on VPS

1. Set production `.env` (`NODE_ENV=production`, secrets, `UPLOAD_ROOT` outside web root, Cloudinary, `VIDEO_HLS_ENABLED` as needed).
2. `npm ci --omit=dev && npm run seed:roles`
3. Do **not** auto-run `seed:curriculum` in production.
4. Process manager (pm2/systemd) on `npm start`.
5. Ensure reverse proxy does not expose `UPLOAD_ROOT` as static files.
