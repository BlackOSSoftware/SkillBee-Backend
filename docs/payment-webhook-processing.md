# Payment Webhook Processing

## Razorpay — `POST /api/v1/webhooks/razorpay`

- Raw body + `X-Razorpay-Signature`
- HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`
- Dedup via `WebhookEvent` `(provider, eventId)`
- Events: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, refunds
- Never downgrade captured → failed

## PayPal — `POST /api/v1/webhooks/paypal`

- JSON body + transmission headers
- Verified with PayPal API using `PAYPAL_WEBHOOK_ID`
- Dedup via `WebhookEvent` `(paypal, eventId)`
- Events: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.PENDING|COMPLETED|DENIED|REFUNDED|REVERSED`
- Capture completed → same `completePaidOrder` fulfillment as Razorpay

## Shared rules

- Amount/currency checked against SkillBee order (`paymentAmountMinor` / `paymentCurrency` when set)
- Duplicate events never duplicate enrollments
- Failed internal processing marked for safe retry
