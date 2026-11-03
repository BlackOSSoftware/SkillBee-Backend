# Progress calculation

## Formula

```
progressPercentage = round((completedRequiredLessons / totalRequiredLessons) * 100)
```

- **Required lessons**: `CourseLesson` with `deletedAt: null`, `status: 'published'`, `isRequired: true`.
- **Completed**: `LessonProgress` with `completionStatus: 'completed'` and `revokedAt: null` for that enrollment.
- Optional lessons never affect the percentage.
- Duplicate completion rows are prevented by unique `{ studentId, enrollmentId, lessonId }`.

## Zero required lessons

If `totalRequiredLessons === 0`:

- `progressPercentage` stays **0**.
- Course is **not** auto-marked completed.
- `courseCompletionStatus` remains `not_started` (unless future course-level assessment flags are added).

## Authoritative fields

The API **rejects** client-supplied:

- `progressPercentage`
- `completedLessonsCount`
- `isCourseCompleted`
- `courseCompletionStatus`

Enrollment snapshots (`progressPercentage`, counts, `courseCompletionStatus`) are rewritten only by `recalculateEnrollmentProgress()` after verified writes.

## Lesson completion rules

| Type | Rule |
|------|------|
| `text` | Authenticated student with active enrollment; lesson published; explicit `POST .../complete`. |
| `resource` | Same as text (opening a file is not enough — explicit complete). |
| `live` | Session must have ended (`liveSession.endsAt` in the past) when `endsAt` is set. |
| `video` | Explicit complete allowed after access checks. **Server-side playback progress is not implemented yet.** `watchDurationSeconds` is stored informationally and is **not** proof of watch completion. |
| Linked quiz (`Quiz.lessonId`) | Requires an evaluated attempt with `passed: true`. |
| Linked assignment (`Assignment.lessonId`) | Requires submission status `evaluated` or `returned`. |

## Certificates

Certificate eligibility is **out of scope** for Phase 7. `course.certificate.minimumCompletionPercentage` is not used to issue certificates here.
