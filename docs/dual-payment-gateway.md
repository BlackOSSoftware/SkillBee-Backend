# Dual Payment Gateway — Razorpay + PayPal

SkillBee sells **courses only**. Payments go through:

| Gateway | Audience | Currency |
|---|---|---|
| **Razorpay** | Indian students (`billing.country = IN`) | INR |
| **PayPal** | International students (non-IN by default) | USD (configurable) |

Both share the same `Order`, `Payment`, `Refund`, and enrollment fulfillment pipeline under `src/services/payments/`.

## Selection rules

1. Student completes checkout with **validated billing country** (not IP alone).
2. `GET /api/v1/payments/available/:orderId` returns allowed gateways.
3. India → Razorpay (unless admin `allowedCountries` overrides).
4. Non-India → PayPal (unless admin restricts/expands countries).
5. Env flags: `RAZORPAY_ENABLED`, `PAYPAL_ENABLED`.

## Shared fulfillment

After verified capture (Razorpay signature/webhook or PayPal capture/webhook):

1. Payment → `captured`
2. Order → `completed`
3. Idempotent course enrollment (`source: purchase`)
4. Redis commerce/enrollment cache invalidation
5. Confirmation emails

## Layout

```
src/services/payments/
  razorpay.service.js
  paypal.service.js
  payment.service.js
  payment-verification.service.js
  payment-fulfillment.service.js
  refund.service.js
  gateway-selection.service.js
  gateway-config.service.js
  currency.service.js
  webhook-paypal.service.js
```

Commerce module controllers re-export / call this layer.
