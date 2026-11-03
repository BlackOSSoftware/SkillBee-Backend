# Phase 6 – Assignment Management

**Scope:** Backend only (REST + MongoDB + VPS file storage). No Admin/Student UI. WordPress unchanged.

## Summary

SkillBee Phase 6 adds assignment creation, student submissions (text / file / both), authenticated attachment downloads, instructor grading with evaluation history, and soft-delete archival that preserves submissions.

## Models

| Model | Purpose |
|-------|---------|
| `Assignment` | Assignment config, due dates, submission rules |
| `AssignmentSubmission` | Student work, attachments metadata, grades, version/evaluation history |
| `MediaAsset` | Reused with category `assignment_submission` for VPS document metadata |

## Storage

- Files under `{UPLOAD_ROOT}/assignments/YYYY-MM-DD/{randomHex}.ext`
- Metadata in MongoDB; absolute paths never returned to clients
- Signature checks via existing media validation helpers
- Downloads via authenticated `/student|admin/submissions/:id/attachments/:attachmentId/download`

## Permissions

- `assignments.read|create|update|delete|publish|submissions.read|grade`

## Status

- Assignment: `draft` → `published` → `closed` / `archived`
- Submission: `submitted` | `under_review` | `evaluated` | `returned` | `resubmitted`

## Seed

```bash
npm run seed:roles
npm run seed:curriculum
npm run seed:assignments
```

Development demo only — not WordPress imports.

## Tests

```bash
npm test
npm run validate:openapi
```

## Dependencies / limitations

- Relies on Phase 2–4 Course, Lesson, Enrollment, and local VPS document storage
- No Cloudinary for assignment files
- Abandoned multer temp files under `temporary/assignments/` can be cleaned by ops cron (same pattern as media temps)
- Concurrent double-submit is mitigated by unique `(assignmentId, studentId)` and 409 on duplicates; not a multi-document transaction
