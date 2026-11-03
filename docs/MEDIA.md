# Phase 4 — Media Management

**Policy:** Images and videos are **view/playback only** (`downloadAllowed: false`, `Content-Disposition: inline`). They are never offered as forced downloads. Study documents may download when authorized.

## Storage

| Type | Provider |
|------|----------|
| Images (thumbnail/gallery/instructor) | Cloudinary signed uploads |
| Videos | VPS under `UPLOAD_ROOT/videos/originals/` |
| Documents | VPS under `UPLOAD_ROOT/documents/` |

MongoDB stores `MediaAsset` + `MediaUploadSession` metadata only.

## Key endpoints

- `POST /api/v1/admin/media/upload-url`
- `PUT /api/v1/admin/media/uploads/:uploadId/content` (+ `X-Upload-Token`)
- `POST /api/v1/admin/media/confirm`
- `GET /api/v1/admin/media` / `/:id` / `PATCH` / `DELETE` / `/:id/restore` / `/:id/references`
- `GET /api/v1/admin/media/storage` / `categories`
- `GET /api/v1/learning/media/:id/playback` (view auth)
- `GET /api/v1/learning/media/:id/stream?token=` (inline Range stream)

## Not implemented

- Resumable/chunked uploads
- In-request FFmpeg/HLS (set `VIDEO_HLS_ENABLED=true` → `pending` until external worker)

## Tests

```bash
npm test
npm run e2e:media
```
