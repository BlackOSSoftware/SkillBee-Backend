# Payment Security

## Secrets

| Secret | Where | Client exposure |
|---|---|---|
| Razorpay Key Id | Config / env | Allowed in create-order response |
| Razorpay Key Secret | Encrypted DB / env | Never |
| Webhook Secret | Encrypted DB / env | Never |
| `PAYMENT_SECRET_ENCRYPTION_KEY` | Server env only | Never |

If encryption key is missing, gateway secret updates fail closed (no plaintext storage).

## Controls

- JWT auth + RBAC on all private commerce endpoints
- Order/payment ownership checks for students
- Integer paise math only (no float money)
- Idempotency keys on payment create and refunds
- Signature verification + webhook verification (dual path)
- Rate limiting (production); Zod validation; ObjectId checks
- Invoice download requires ownership or admin
- Logs omit secrets, card data, CVV, UPI PIN (never stored)

## Threats mitigated

| Threat | Mitigation |
|---|---|
| Price tampering | DB-sourced totals |
| Fake browser success | Signature + webhook + amount match |
| Replay verify | Idempotent payment status |
| Duplicate enroll | Unique enrollment + fulfillment idempotency |
| Secret leak via API | Masked responses; no overwrite with `****` |
