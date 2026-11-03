# Phase 2 — Course Management

## Commands

```bash
npm run seed:roles   # seeds course permissions + instructor role
npm run dev
npm test
```

Swagger: `/api/v1/docs`

## Key env vars

| Variable | Purpose |
|----------|---------|
| `UPLOAD_ROOT` | VPS disk root for videos/docs (default `./uploads`) |
| `MAX_VIDEO_SIZE_MB` | Video upload cap |
| `MAX_DOCUMENT_SIZE_MB` | Document upload cap |
| `ALLOW_PUBLISH_WITHOUT_LESSONS` | `true` to allow publish with empty curriculum |
| `CLOUDINARY_*` | Image hosting (optional until configured) |
| `PLAYBACK_TOKEN_SECRET` | Short-lived video playback tokens (defaults to access secret) |

## Admin bases

- `/api/v1/admin/courses`
- `/api/v1/admin/course-categories`
- `/api/v1/admin/instructors`
- `/api/v1/admin/topics/:topicId/lessons`
- `/api/v1/admin/lessons/:lessonId`
- `/api/v1/admin/reviews`

## Public / learning

- `/api/v1/courses`
- `/api/v1/course-categories`
- `/api/v1/learning/resources/:resourceId/download`
- `/api/v1/learning/lessons/:lessonId/playback-token`

## Incomplete / next steps (honest)

1. **HLS transcoder worker** — uploads store files and mark `processingStatus`; production needs an async job to generate HLS outputs.
2. **Cloudinary signed uploads** — metadata attach works now; direct buffer upload helpers exist but require env credentials.
3. **Student review create API** — model + admin moderation exist; student submit endpoint is planned for engagement phase.
4. **Commerce/revenue analytics** — intentionally omitted until payments module.
