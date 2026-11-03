# Certificate eligibility

Service: `certificateEligibility.service.js`

## Checks (all server-side)
1. Course exists and `certificate.enabled === true`
2. Enrollment exists and is not revoked/cancelled/suspended/pending/expired
3. Enrollment not time-expired (`expiresAt`)
4. All published required lessons completed (`LessonProgress`)
5. Progress ≥ `course.certificate.minimumCompletionPercentage`
6. Lesson-linked published quizzes have a passed evaluated attempt
7. Lesson-linked published/closed assignments have evaluated/returned submission
8. No existing active (`issued`) certificate for the enrollment

Client-supplied progress, names, or eligibility flags are never trusted.

## Separation
Eligibility check ≠ issuance. Students cannot call issue APIs.
