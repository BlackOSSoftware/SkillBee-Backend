# Refund Management

## API

`POST /api/v1/admin/orders/:id/refunds`

Body (optional fields):

- `amountPaise` — omit for full remaining refundable amount
- `reason`
- `revokeEnrollment` — explicit override; default from `REFUND_REVOKE_ENROLLMENT_DEFAULT`
- `idempotencyKey`

Also: `GET /admin/refunds`, `GET /admin/refunds/:id`

## Rules

1. Original payment must be captured
2. Refund amount ≤ remaining refundable paise
3. Razorpay refund API called server-side; provider refund id stored
4. Partial and full refunds supported; duplicates blocked via idempotency / remaining amount
5. Webhooks update refund status (`processed` / `failed`)

## Enrollment policy

**Refund does not automatically revoke enrollment.**

Revocation happens only when:

- `REFUND_REVOKE_ENROLLMENT_DEFAULT=true`, or
- Admin sets `revokeEnrollment: true` on the refund request

Revocation uses Phase 7 enrollment revocation. Learning progress, quiz attempts, assignments, and certificates are **never deleted** by refund handling.
