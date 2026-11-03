# Phase 12 — Reviews & Ratings (Completion Report)

## Eligibility

Default: active learning enrollment via `findLearningEnrollment` (blocks revoked, expired, suspended).

Optional server policy: `REVIEW_REQUIRE_COURSE_COMPLETION=true` requires `courseCompletionStatus=completed` (or enrollment `status=completed`). Frontend cannot override.

## Workflow

1. Student submits → `pending` (not public)
2. Student edits own review → back to `pending`; moderation fields cleared for re-review; history preserved
3. Admin approves/rejects → `Course.ratingStats` recalculated from approved only; Redis keys invalidated
4. Soft-delete sets `deletedAt`; unique partial index allows a new review after delete

## APIs

| Method | Path |
|---|---|
| POST | `/api/v1/student/courses/:id/reviews` |
| PATCH | `/api/v1/student/reviews/:id` |
| GET | `/api/v1/admin/reviews` |
| GET | `/api/v1/admin/reviews/:id` |
| PATCH | `/api/v1/admin/reviews/:id/status` |
| DELETE | `/api/v1/admin/reviews/:id` |
| GET | `/api/v1/courses/:id/reviews` |

## Statistics

`Course.ratingStats` + Redis (`course:rating-stats:{id}`, `course:reviews:public:{id}:…`). Aggregation from approved reviews only. Distribution stars 1–5.

## Files created

- `src/models/CourseReview.js` (extended for Phase 12 fields / indexes / moderation history)
- `src/modules/courses/services/review.service.js`
- `src/modules/courses/services/ratingStats.service.js`
- `src/modules/courses/controllers/review.controller.js`
- `src/modules/courses/validators/review.validator.js`
- `src/docs/reviews.openapi.js`
- `tests/reviews.test.js`
- `tests/reviews.unit.test.js`
- `docs/phase-12-reviews-ratings.md`

## Files modified

- `src/models/Course.js` — `ratingStats` aggregate fields; exposed on `toAdminObject`
- `src/modules/courses/routes/index.js` — student review mounts; admin reviews router
- `src/modules/courses/routes/adminCourse.routes.js` — admin review moderation routes
- `src/modules/courses/routes/publicCourse.routes.js` — public reviews
- `src/config/env.js` — `REVIEW_REQUIRE_COURSE_COMPLETION`
- `src/config/security.js` — `REVIEW_STATUS`
- `src/docs/openapi.js` — Phase 12 tags/paths
- `package.json` — `test:reviews` + suite inclusion
- `tests/helpers/setup.js` — syncIndexes before suites (text/unique indexes)
- `src/modules/courses/services/course.service.js` — admin search via regex (avoids `$text` index race)
- `src/modules/courses/services/publicCourse.service.js` — public search via regex

## Indexes

`CourseReview`: unique partial `{ studentId, courseId }` where `deletedAt: null`; `{ courseId, status, createdAt }`; `{ status, createdAt }`; `{ rating, status }`.

`Course`: existing indexes plus embedded `ratingStats` (no separate collection).

## Test execution (actual)

Commands: `npm run test:reviews`, `node --test ./tests/courses.test.js`, `npm test`

| Suite | Result |
|---|---|
| `reviews.unit.test.js` + `reviews.test.js` | **9 pass / 0 fail** |
| `courses.test.js` | **4 pass / 0 fail** |
| Full `npm test` (auth→reviews) | **105 pass / 0 fail / 0 skipped** (confirmed on consecutive runs) |

Note: One earlier full-suite run briefly showed 104/105 before index/search hardening; subsequent runs are 105/105.

## Limitations

- Redis is disabled in automated tests (`REDIS_ENABLED=false`); cache helpers no-op safely; invalidation paths are exercised without a live Redis.
- Public review list cache uses prefix clear; depends on Redis key enumeration support in the existing cache service.
- Student field stored as `studentId` in Mongo; API responses expose `userId` for the Phase 12 contract.
