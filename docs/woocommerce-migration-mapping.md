# WooCommerce → SkillBee Commerce Migration Mapping

SkillBee Phase 9–10 **replaces** WooCommerce checkout/orders/payments with native APIs. Historical WordPress data is **not** auto-imported.

## Safe conceptual mapping (manual migration only)

| WooCommerce | SkillBee |
|---|---|
| Product linked to a course | `Course` + `Course.pricing` (no Product entity) |
| Order | `Order` with course item snapshots |
| Order line item | `Order.items[]` |
| Customer | `User` (student) |
| Payment via Razorpay plugin | `Payment` + Razorpay native SDK |
| Coupon | `Coupon` (course-scoped; not product-category coupons) |
| Enrollment after paid | Phase 7 `CourseEnrollment` via fulfillment |

## Requires manual verification before any import

- Whether each WC product maps 1:1 to a SkillBee Course `_id` / slug
- Historical prices vs current Course pricing (snapshots must preserve paid amounts)
- Partial refunds and subscription/recurring products (SkillBee is one-time course purchase)
- Tax/GST line items and invoice legal fields
- Coupon types that depended on product categories/tags (not supported)
- Existing Razorpay payment IDs / webhook history (do not invent; verify in Razorpay Dashboard)
- WordPress payment secrets (must be **re-entered** by admin into SkillBee — never auto-copied)

## Explicit non-goals

- No silent creation of SkillBee orders from WC CSV without ops review
- No physical goods, shipping, or stock fields
- No assumption that all historical enrollments came from paid WC orders

Document gaps with ops before bulk import scripts are written.
