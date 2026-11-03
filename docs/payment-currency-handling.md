# Payment Currency Handling

## Principles

- Integer **minor units** only (paise / cents). No floating-point money math for totals.
- Order item currency and totals are stored permanently at checkout.
- Gateway charge may use `paymentCurrency` + `paymentAmountMinor` when FX applies.
- **Never silently convert.** Conversion requires an explicit trusted rate.

## Razorpay

- Requires **INR**.
- Charge = order `totalPaise`.

## PayPal

- Default charge currency: `PAYPAL_CURRENCY` (USD).
- If order currency already matches PayPal currency → no FX.
- If order is INR and PayPal is USD → require `PAYMENT_FX_INR_TO_USD` (USD major per 1 INR major).
- Snapshot stored on order: `fxSnapshot { fromCurrency, toCurrency, rate, source, originalAmountMinor, convertedAmountMinor }`.

## Example

Order total `₹5000` = `500000` paise, rate `0.012` → `6000` USD cents (`$60.00`).

Students cannot submit payable amount or currency; backend rejects trusted price fields at checkout.
