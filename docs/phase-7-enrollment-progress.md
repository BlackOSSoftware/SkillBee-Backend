# Phase 7 – Student Enrollment and Progress

Backend-only module for SkillBee LMS. MongoDB is the source of truth; Redis caches student/admin read aggregates.

## Models

| Model | Path | Notes |
|-------|------|--------|
| `CourseEnrollment` (extended) | `src/models/CourseEnrollment.js` | Status, type, expiry, progress snapshot, history events |
| `LessonProgress` (new) | `src/models/LessonProgress.js` | One row per student + enrollment + lesson |

## APIs

### Admin
- `GET/POST /api/v1/admin/enrollments`
- `GET/PATCH/DELETE /api/v1/admin/enrollments/:id`
- `PATCH /api/v1/admin/enrollments/:id/status`
- `GET /api/v1/admin/enrollments/:id/history`
- `GET /api/v1/admin/enrollments/:id/progress`
- `GET /api/v1/admin/courses/:courseId/enrollments`
- `GET /api/v1/admin/students/:studentId/enrollments`
- `POST /api/v1/admin/enrollments/sync-expired`

### Student
- `GET /api/v1/student/my-courses`
- `GET /api/v1/student/courses/:id/progress`
- `GET /api/v1/student/dashboard`
- `POST /api/v1/student/lessons/:id/complete`

## Seed

```bash
npm run seed:curriculum   # if demo course missing
npm run seed:enrollment
```

Primary seeded learner: `student.progress@skillbee.local` / `ChangeMe123` → **70%** (7/10).

## Tests

```bash
npm run test:enrollment
npm test   # includes Phase 1–7 regression
```

## Related docs

- `docs/progress-calculation.md`
- `docs/enrollment-access-control.md`
- `docs/api/enrollment-progress.md`
- `docs/cache-invalidation.md`
