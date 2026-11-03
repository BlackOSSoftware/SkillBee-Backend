# Phase 10 — Razorpay Payment Gateway

## Architecture

| Piece | Location |
|---|---|
| Razorpay SDK wrapper | `src/modules/commerce/services/razorpay.service.js` |
| Create / verify payment | `payment.service.js` |
| Webhooks | `webhook.service.js` + raw-body route before `express.json` |
| Gateway config | `PaymentGatewayConfig` + `gatewayConfig.service.js` |
| Refunds | `refund.service.js` |
| Fulfillment | `fulfillment.service.js` (enrollment activation) |

## Configuration

Secrets are encrypted at rest with `PAYMENT_SECRET_ENCRYPTION_KEY` (AES-256-GCM). Admin APIs return **masked** secrets only. Empty/masked placeholders never overwrite existing secrets.

Fallback (dev/test): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_MODE`.

Do **not** import WordPress/WooCommerce Razorpay secrets automatically.

## Payment APIs

| Method | Path | Notes |
|---|---|---|
| POST | `/payments/razorpay/create-order` | Amount from MongoDB order only |
| POST | `/payments/razorpay/verify` | HMAC signature + amount/currency checks; idempotent |
| POST | `/webhooks/razorpay` | Trusted reconciliation; deduped by event id |
| POST | `/admin/orders/:id/refunds` | Full/partial; enrollment revoke opt-in |
| GET | `/admin/payments`, `/admin/refunds` | Admin audit |
| GET/PATCH | `/admin/payment-gateways/...` | Masked config |

## Models

- `Payment` — attempts, provider ids, statuses, idempotency key
- `Refund` — provider refund id, amounts, status
- `WebhookEvent` — unique `(provider, eventId)`, processing status
- `PaymentGatewayConfig` — encrypted secrets, mode, enable flag

## Security

- Never expose Key Secret or Webhook Secret to clients
- Browser redirect alone is **not** payment proof
- Webhooks verified on raw body; duplicates ignored safely
- Captured payments are never downgraded by older failed events
