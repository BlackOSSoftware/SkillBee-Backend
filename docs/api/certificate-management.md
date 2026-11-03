# API – Certificates

## Admin templates
| Method | Path |
|--------|------|
| GET/POST | `/admin/certificate-templates` |
| GET/PATCH/DELETE | `/admin/certificate-templates/:id` |
| PATCH | `/admin/certificate-templates/:id/status` |
| PATCH | `/admin/certificate-templates/:id/default` |
| POST | `/admin/certificate-templates/:id/duplicate` |

## Admin certificates
| Method | Path |
|--------|------|
| GET | `/admin/certificates` |
| POST | `/admin/certificates/issue` |
| GET | `/admin/certificates/:id` |
| POST | `/admin/certificates/:id/revoke` |
| POST | `/admin/certificates/:id/regenerate` |
| GET | `/admin/certificates/:id/history` |
| GET | `/admin/certificates/:id/download` |
| GET | `/admin/students/:studentId/certificate-eligibility/:courseId` |

## Student
| Method | Path |
|--------|------|
| GET | `/student/certificates` |
| GET | `/student/certificates/:id` |
| GET | `/student/certificates/:id/download` |

## Public
| Method | Path |
|--------|------|
| GET | `/certificates/verify/:code` |

### Issue body
```json
{ "studentId": "...", "courseId": "...", "templateId": "...", "reason": "Manual" }
```
Forbidden: `studentName`, `courseName`, `completionDate`, `certificateNumber`, eligibility flags.
