# Cache invalidation

Invalidation runs **after successful MongoDB writes**. Redis failures are logged via metrics and never roll back the DB write; TTL still bounds staleness.

## Helpers

`src/services/cache/invalidation.service.js`

| Helper | When |
|--------|------|
| `invalidateCourseCaches` | Course create/update/delete/status/sort |
| `invalidateCategoryCaches` | Category CRUD/reorder |
| `invalidateCurriculumByCourseId` | Topic/lesson create/update/delete/reorder/publish |
| `invalidateAssignmentCaches` | Assignment CRUD/status |
| `invalidateStudentAssignmentList` | Submit / grade / return |
| `invalidateQuizMetaCaches` | Quiz update/publish/archive |
| `invalidateEnrollmentCaches` | Enrollment create/update/revoke/expire; lesson completion; progress recalculation |

### Enrollment key prefixes

- `student:courses:{studentId}:*`
- `student:dashboard:{studentId}`
- `student:progress:{studentId}:{courseId}`
- `admin:enrollments:*`

## Patterns

- Prefer prefix clears for listings: `public:courses:list:*`
- Prefer exact keys for detail: `public:courses:detail:{slug}:enrolled:0`
- Student private data always includes `studentId` in the key
- Authorization is always re-checked in MongoDB — Redis never stores access decisions
- No `FLUSHALL` / `FLUSHDB` in application code

## Staleness window

If Redis invalidation fails, max staleness ≈ configured TTL (e.g. 5 minutes for course lists).
