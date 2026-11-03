/**
 * Integer minor-unit money helpers (INR → paise).
 * Never use floating-point for payment amounts.
 */

export function toMinorUnits(majorAmount, currency = 'INR') {
  const n = Number(majorAmount);
  if (!Number.isFinite(n) || n < 0) return 0;
  // INR / most ISO currencies: 2 decimal places
  void currency;
  return Math.round(n * 100);
}

export function fromMinorUnits(paise, currency = 'INR') {
  void currency;
  return Number((Number(paise || 0) / 100).toFixed(2));
}

export function percentOfMinor(paise, percent) {
  const p = Number(percent) || 0;
  return Math.round((Number(paise) * p) / 100);
}

export function sumMinor(values) {
  return values.reduce((s, v) => s + (Number(v) || 0), 0);
}
