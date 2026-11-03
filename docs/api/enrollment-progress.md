# API – Enrollment & Progress

Base: `/api/v1`  
Auth: Bearer access token

## Admin

| Method | Path | Role |
|--------|------|------|
| GET | `/admin/enrollments` | admin |
| POST | `/admin/enrollments` | admin |
| GET | `/admin/enrollments/:id` | admin |
| PATCH | `/admin/enrollments/:id` | admin |
| DELETE | `/admin/enrollments/:id` | admin (revoke) |
| PATCH | `/admin/enrollments/:id/status` | admin |
| GET | `/admin/enrollments/:id/history` | admin |
| GET | `/admin/enrollments/:id/progress` | admin |
| GET | `/admin/courses/:courseId/enrollments` | admin |
| GET | `/admin/students/:studentId/enrollments` | admin |

### Create body

```json
{
  "studentId": "<ObjectId>",
  "courseId": "<ObjectId>",
  "enrollmentType": "admin_granted",
  "status": "active",
  "enrollmentExpiresAt": null,
  "reason": "Manual grant"
}
```

No payment records are created.

## Student

| Method | Path |
|--------|------|
| GET | `/student/my-courses?filter=all\|in_progress\|completed\|pending\|not_started\|expired\|active` |
| GET | `/student/courses/:courseId/progress` |
| GET | `/student/dashboard` |
| POST | `/student/lessons/:lessonId/complete` |

### Complete lesson

```json
{ "watchDurationSeconds": 120 }
```

Forbidden in body: `progressPercentage`, `completedLessonsCount`, `isCourseCompleted`, `courseCompletionStatus`.

### Response (complete)

```json
{
  "success": true,
  "data": {
    "alreadyCompleted": false,
    "lessonProgress": { "...": "..." },
    "progress": {
      "progressPercentage": 70,
      "completedLessonsCount": 7,
      "totalRequiredLessons": 10,
      "courseCompletionStatus": "in_progress"
    }
  }
}
```
