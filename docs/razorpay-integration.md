# Razorpay Integration (India)

## Env

```env
RAZORPAY_ENABLED=true
RAZORPAY_MODE=test
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

## APIs

| Method | Path |
|---|---|
| POST | `/api/v1/payments/razorpay/create-order` |
| POST | `/api/v1/payments/razorpay/verify` |
| POST | `/api/v1/webhooks/razorpay` |

## Flow

Pending INR order → create Razorpay order (amount from MongoDB) → student pays → verify HMAC signature → reconcile payment → `completePaidOrder` → webhook `payment.captured` / `order.paid` idempotent.

Browser redirect alone is never proof of payment.

Secrets never appear in API responses (Key Id may be returned for Checkout.js only).
