# Phase 8 – Certificate Management

Backend-only certificate templates, eligibility, PDF issuance, QR verification, and revocation.

## Models
- `CertificateTemplate` — layouts and branding (soft-delete; cannot delete if referenced)
- `Certificate` — immutable issuance record + PDF storage key + checksum
- `CertificateCounter` — atomic year-scoped number sequence

## Number format
`{PREFIX}-{YEAR}-{NNNNNN}` e.g. `SKB-2026-000001`  
Prefix: `CERTIFICATE_NUMBER_PREFIX` (default `SKB`). Never reused after revoke.

## Key APIs
See `docs/api/certificate-management.md`.

## Auto-issue
When `course.certificate.enabled` and `course.certificate.autoIssue` are true, Phase 7 progress recalculation schedules async issuance after `courseCompletionStatus === 'completed'`. Duplicate active certificates are blocked by a partial unique index on `enrollmentId`.

## Storage
PDFs under `{UPLOAD_ROOT}/certificates/{date}/`. Not Cloudinary. Temp files cleaned after success/failure.

## Tests
```bash
npm run test:certificates
npm test
```
