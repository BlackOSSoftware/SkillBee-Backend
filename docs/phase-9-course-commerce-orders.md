# Phase 9 — Course Commerce & Order Management

## Business rule

SkillBee sells **online courses only**. There is no Product model, inventory, shipping, or WooCommerce product catalog. The Phase 2 **Course** document is the purchasable entity (`Course.pricing`).

## Pricing (Course model)

| Field | Purpose |
|---|---|
| `pricing.type` | `free` \| `paid` |
| `pricing.regularPrice` / `salePrice` | Major units (INR rupees); converted to paise for payments |
| `pricing.currency` | Default `INR` |
| `pricing.isPurchasable` | Must be true to buy |
| `pricing.purchaseAvailability` | Optional start/end window |
| `pricing.automaticEnrollmentEnabled` | Auto-enroll after paid/free fulfillment |
| `pricing.taxConfiguration` | Optional tax percent / inclusive flag |

Backend never trusts frontend prices. Payable amount is always recalculated from MongoDB (integer paise arithmetic).

## Cart

- Model: `Cart` — one cart per student
- APIs under `/api/v1/student/cart`
- Rejects duplicates and already-enrolled courses
- Prices refreshed from Course on every read

Direct checkout without cart is supported via `POST /student/checkout` with `courseIds`.

## Orders

- Model: `Order` + atomic `OrderCounter` → numbers like `SKB-ORD-2026-000001`
- Immutable item snapshots (title, slug, thumbnail, prices)
- Separate `orderStatus` and `paymentStatus`
- Admin cannot mark unpaid orders `completed` via status patch

### Student APIs

- `GET /student/orders`, `GET /student/orders/:id`, `GET /student/orders/:id/invoice`

### Admin APIs

- `GET /admin/orders` (search, filters, pagination)
- `GET /admin/orders/:id`, `PATCH .../status`, `GET .../history`, `GET .../invoice`
- `GET /admin/courses/:courseId/orders`
- `GET /admin/students/:studentId/orders`

## Coupons

Model `Coupon` supports fixed/percentage, course-specific, min amount, usage limits, dates. Eligibility validated server-side; immutable snapshot stored on the order. Historical WooCommerce coupon parity is **not** auto-migrated (see `woocommerce-migration-mapping.md`).

## Invoices

PDF generated after paid/free completion; stored on VPS under `UPLOAD_ROOT` (not in MongoDB). Metadata kept on the order.

## Free courses

Zero verified backend price → order completed without Razorpay; enrollment source `free` / purchase path without payment record.
