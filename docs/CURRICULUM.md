# SkillBee Phase 3 — Curriculum, Lessons, Video & Attachments

Base URL: `/api/v1`  
Swagger: `/api/v1/docs`

## Hierarchy

Course → Topics (chapters) → Lessons → Video/Text/Live/Resource + Attachments

## Storage

| Asset | Storage |
|-------|---------|
| Course images | Cloudinary metadata |
| Lesson videos | VPS disk under `UPLOAD_ROOT/videos/` |
| Documents / attachments | VPS disk under `UPLOAD_ROOT/documents/` |

Protected files are **not** served via public static middleware. Learners use authenticated download / playback-token + Range stream endpoints.

### Video processing

- `VIDEO_HLS_ENABLED=false` (default): after upload, `processingStatus=ready` with `availableQualities=["source"]` for progressive playback. No fabricated HLS paths.
- `VIDEO_HLS_ENABLED=true`: upload stays `pending` until an external FFmpeg worker writes a verified HLS master and marks ready.
- Resumable/chunked upload: **not implemented**.

## Seed (development only)

```bash
npm run seed:roles
npm run seed:curriculum
```

Idempotent by course slug `computerized-system-validation-csv-csa-demo`. Refuses production unless `SEED_ALLOW_PRODUCTION=true`.

## Tests

```bash
npm test
# or
node --test --test-concurrency=1 ./tests/auth.test.js ./tests/courses.test.js ./tests/curriculum.test.js
```

Live API check (server must be running):

```bash
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run e2e:curriculum
```
