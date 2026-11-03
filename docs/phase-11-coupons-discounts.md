# Phase 11 — Coupons & Discounts

## Overview

Server-side coupon management for SkillBee course commerce. Prices and discounts are never trusted from the client. Coupons integrate with Phase 9/10 checkout, Razorpay, and PayPal via a **reserve → consume / release** usage lifecycle.

## Models

- `Coupon` — code, percentage/fixed discount, limits, dates, applicability, `usedCount` + `reservedCount`
- `CouponUsage` — per-order reservation/consumption (`reserved` | `consumed` | `released` | `failed`)

## Endpoints

| Method | Path | Access |
|---|---|---|
| GET/POST | `/api/v1/admin/coupons` | Admin |
| GET/PATCH/DELETE | `/api/v1/admin/coupons/:id` | Admin |
| GET | `/api/v1/admin/coupons/:id/usage` | Admin |
| POST | `/api/v1/coupons/validate` | Student |

## Lifecycle

1. Validate / checkout recalculates prices from MongoDB
2. Order created with immutable `couponSnapshot`
3. `CouponUsage` **reserved** (+ `reservedCount`)
4. Payment success → **consumed** (+ `usedCount`, − reserved)
5. Payment fail / cancel → **released** (− reserved)
6. 100% discount → free fulfillment path, consume immediately

## Discount engine

`discount.engine.js` — shared by validate + checkout. Caps percentage with `maximumDiscountAmount`; never exceeds eligible subtotal; final amount ≥ 0.
