# Assignment Management API

Base: `/api/v1`  
Auth: Bearer JWT  
Swagger: `/api/v1/docs`

## Admin / Instructor

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/assignments` | `assignments.read` |
| POST | `/admin/assignments` | `assignments.create` |
| GET | `/admin/assignments/:id` | `assignments.read` |
| PATCH | `/admin/assignments/:id` | `assignments.update` |
| DELETE | `/admin/assignments/:id` | `assignments.delete` |
| PATCH | `/admin/assignments/:id/status` | `assignments.publish` |
| GET | `/admin/assignments/:id/submissions` | `assignments.submissions.read` |
| GET | `/admin/submissions/:id` | `assignments.submissions.read` |
| PATCH | `/admin/submissions/:id/grade` | `assignments.grade` |
| PATCH | `/admin/submissions/:id/return` | `assignments.grade` |
| GET | `/admin/submissions/:id/history` | `assignments.submissions.read` |
| GET | `/admin/submissions/:id/attachments/:attachmentId/download` | `assignments.submissions.read` |

Instructors are limited to assigned courses.

### Create body (example)

```json
{
  "title": "CSV Documentation Package Review",
  "instructions": "Upload a PDF summary…",
  "courseId": "…",
  "lessonId": "…",
  "dueDate": "2026-12-01T23:59:59.000Z",
  "maximumMarks": 20,
  "submissionType": "file_upload",
  "allowedFileTypes": [".pdf", ".docx"],
  "maximumFileSizeBytes": 5242880,
  "allowLateSubmission": false,
  "allowResubmission": true,
  "maxSubmissions": 2
}
```

### Grade body

```json
{
  "marksAwarded": 18,
  "feedback": "Strong documentation summary."
}
```

## Student

| Method | Path | Notes |
|--------|------|-------|
| GET | `/student/assignments` | Published + enrolled only |
| GET | `/student/assignments/my-submissions` | Own history |
| GET | `/student/assignments/:id` | Published details |
| POST | `/student/assignments/:id/submit` | `multipart/form-data`: `textContent`, `files` |
| GET | `/student/submissions/:id` | Own only |
| GET | `/student/submissions/:id/feedback` | Own feedback |
| GET | `/student/submissions/:id/attachments/:attachmentId/download` | Own / staff |

Students cannot set `marksAwarded`, `submissionStatus`, or evaluation fields.

## File rules

- Allowed extensions configured per assignment
- Size capped by `maximumFileSizeBytes` and global `MAX_DOCUMENT_SIZE_MB`
- Content signature validated (e.g. `%PDF` for PDFs)
- Stored as `assignments/YYYY-MM-DD/{hex}.ext` under `UPLOAD_ROOT`
