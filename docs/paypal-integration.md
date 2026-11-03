# PayPal Integration (International)

## Env

```env
PAYPAL_ENABLED=true
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_CURRENCY=USD
PAYMENT_FX_INR_TO_USD=
```

## APIs

| Method | Path |
|---|---|
| POST | `/api/v1/payments/paypal/create-order` |
| POST | `/api/v1/payments/paypal/capture-order` |
| POST | `/api/v1/webhooks/paypal` |

## Flow

1. Checkout with non-IN billing country
2. Server creates PayPal order (REST v2); amount/currency from MongoDB (+ FX snapshot if INR→USD)
3. Client receives `approveUrl` only (no secrets)
4. `capture-order` performs server-side capture and amount/currency checks
5. Webhooks verified via PayPal `verify-webhook-signature` + `PAYPAL_WEBHOOK_ID`
6. Events: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.*`, refunds/reversals

Duplicate captures/webhooks do not duplicate enrollments.
