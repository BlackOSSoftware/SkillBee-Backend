# Course Checkout Workflow

```
Student selects course(s)
  → POST /student/checkout
  → Validate published + purchasable + not already enrolled
  → Recalculate prices from MongoDB (paise)
  → Optional coupon validation
  → Create pending Order + immutable snapshots
       │
       ├─ totalAmountPaise === 0  → fulfill free → enroll → invoice/email
       │
       └─ totalAmountPaise > 0
            → POST /payments/razorpay/create-order
            → Frontend opens Razorpay Checkout (Key Id + order id only)
            → Student pays
            → POST /payments/razorpay/verify (signature)
            → Webhook payment.captured / order.paid
            → Mark payment captured, order completed
            → Idempotent enrollment activation
            → Invoice + confirmation email
```

## Policies

- **Mixed free + paid cart:** each line priced independently; free lines enroll on fulfillment when the order is completed (paid path waits for capture; free-only orders complete immediately).
- **Price tampering:** ignored — totals always from DB.
- **Enrollment source:** purchase (paid) or free checkout path as recorded by fulfillment.
- **Failure after capture:** payment retained; fulfillment marked pending for safe retry (no payment loss).

## What frontend must send

Checkout: `courseIds` or `useCart`, optional `billing`, optional `couponCode`.

Create order: `orderId` only.

Verify: `orderId`, `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`.

Never send trusted `amount`, `discount`, or `total`.
