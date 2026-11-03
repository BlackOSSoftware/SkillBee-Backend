# Enrollment access control

Central helper: `src/modules/enrollment/services/enrollmentAccess.service.js`.

## Learning access grant

All of the following must hold:

1. Enrollment `deletedAt` is null.
2. `status` is `active` or `completed`.
3. `expiresAt` is null **or** `expiresAt > now` (enforced on every check — not only via the sync job).
4. Status is not `revoked`, `cancelled`, `suspended`, `pending`, or `expired`.

Used by:

- Lesson completion
- Learning curriculum / playback
- Quiz start eligibility
- Assignment submissions
- Media view / attachments / resources

Platform admins / assigned instructors bypass student enrollment for staff tools, but **cannot** invent student progress without an enrollment context.

## Revocation

`DELETE /admin/enrollments/:id`:

- Sets `status=revoked`, `revokedAt`, `revokedBy`, `revocationReason`
- Appends history event
- Invalidates Redis enrollment caches
- **Preserves** `LessonProgress`, quiz attempts, and assignment submissions

## Expiration sync

`POST /admin/enrollments/sync-expired` flips overdue rows to `expired`. Access denial does **not** depend on this job because `learningEnrollmentQuery` always filters `expiresAt`.

## Authorization order

1. Authenticate JWT
2. Check role for admin routes (`requireAdminAccess`)
3. For student learning: resolve enrollment **before** returning private cached data
4. Never treat Redis as an authorization decision store
