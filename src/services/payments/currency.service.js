import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

const TWO_DECIMAL = new Set(['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD']);

export function normalizeCurrency(code) {
  return String(code || '').trim().toUpperCase();
}

export function normalizeCountry(code) {
  const raw = String(code || '').trim().toUpperCase();
  if (raw === 'INDIA') return 'IN';
  if (raw === 'UNITED STATES' || raw === 'USA') return 'US';
  return raw.slice(0, 2);
}

/**
 * Convert minor units between currencies using an explicit major-unit rate.
 * rate = units of `toCurrency` major per 1 unit of `fromCurrency` major.
 * Never invents a rate — caller must supply a trusted configured rate.
 */
export function convertMinorUnits(amountMinor, fromCurrency, toCurrency, rateMajor) {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new AppError('Invalid amount for conversion', 400, 'INVALID_AMOUNT');
  }
  if (from === to) {
    return {
      amountMinor,
      fromCurrency: from,
      toCurrency: to,
      rate: '1',
      converted: false,
    };
  }
  const rate = Number(rateMajor);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new AppError(
      `Currency conversion from ${from} to ${to} is not configured`,
      400,
      'FX_NOT_CONFIGURED'
    );
  }
  if (!TWO_DECIMAL.has(from) || !TWO_DECIMAL.has(to)) {
    throw new AppError('Unsupported currency for conversion', 400, 'UNSUPPORTED_CURRENCY');
  }
  // Integer-safe: rate micros (6 decimal places)
  const rateMicros = Math.round(rate * 1_000_000);
  const converted = Math.floor((amountMinor * rateMicros) / 1_000_000);
  if (converted < 1 && amountMinor > 0) {
    throw new AppError('Converted amount too small', 400, 'FX_AMOUNT_TOO_SMALL');
  }
  return {
    amountMinor: converted,
    fromCurrency: from,
    toCurrency: to,
    rate: String(rate),
    converted: true,
  };
}

/**
 * Resolve charge amount for a gateway. Never silently converts.
 */
export function resolveChargeForGateway(order, gateway) {
  const orderCurrency = normalizeCurrency(order.currency || env.PAYMENT_CURRENCY || 'INR');
  const orderMinor = Number(order.totalPaise);

  if (gateway === 'razorpay') {
    if (orderCurrency !== 'INR') {
      throw new AppError(
        'Razorpay requires INR. Convert course pricing or use PayPal for other currencies.',
        400,
        'RAZORPAY_CURRENCY_UNSUPPORTED'
      );
    }
    return {
      currency: 'INR',
      amountMinor: orderMinor,
      fxSnapshot: null,
    };
  }

  if (gateway === 'paypal') {
    const paypalCurrency = normalizeCurrency(env.PAYPAL_CURRENCY || 'USD');
    if (orderCurrency === paypalCurrency) {
      return { currency: paypalCurrency, amountMinor: orderMinor, fxSnapshot: null };
    }
    if (orderCurrency === 'INR' && paypalCurrency === 'USD') {
      const rate = String(env.PAYMENT_FX_INR_TO_USD || '').trim();
      if (!rate) {
        throw new AppError(
          'PayPal requires USD. Set PAYMENT_FX_INR_TO_USD (trusted rate) or price courses in USD.',
          400,
          'FX_NOT_CONFIGURED'
        );
      }
      const converted = convertMinorUnits(orderMinor, 'INR', 'USD', rate);
      return {
        currency: 'USD',
        amountMinor: converted.amountMinor,
        fxSnapshot: {
          fromCurrency: 'INR',
          toCurrency: 'USD',
          rate: converted.rate,
          source: 'env:PAYMENT_FX_INR_TO_USD',
          originalAmountMinor: orderMinor,
          convertedAmountMinor: converted.amountMinor,
          convertedAt: new Date(),
        },
      };
    }
    throw new AppError(
      `No conversion path from ${orderCurrency} to ${paypalCurrency}`,
      400,
      'FX_NOT_CONFIGURED'
    );
  }

  throw new AppError('Unknown payment gateway', 400, 'UNKNOWN_GATEWAY');
}
