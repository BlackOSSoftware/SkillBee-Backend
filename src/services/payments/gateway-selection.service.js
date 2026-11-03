import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { PaymentGatewayConfig } from '../../models/PaymentGatewayConfig.js';
import { normalizeCountry } from './currency.service.js';

const INDIA = new Set(['IN']);

/**
 * List gateways available for a validated billing country.
 * Do not use browser IP as the sole source of country.
 */
export async function listAvailableGateways({ billingCountry, preferredGateway } = {}) {
  const country = normalizeCountry(billingCountry || 'IN');

  const [rzCfg, ppCfg] = await Promise.all([
    PaymentGatewayConfig.findOne({ provider: 'razorpay' }).lean(),
    PaymentGatewayConfig.findOne({ provider: 'paypal' }).lean(),
  ]);

  const gateways = [];

  const rzOn = env.RAZORPAY_ENABLED !== false && (rzCfg ? rzCfg.isEnabled !== false : true);
  const rzCountries =
    rzCfg?.allowedCountries?.length > 0
      ? new Set(rzCfg.allowedCountries.map((c) => normalizeCountry(c)))
      : INDIA;
  if (rzOn && rzCountries.has(country)) {
    gateways.push({
      provider: 'razorpay',
      currency: 'INR',
      mode: env.RAZORPAY_MODE || 'test',
      reason: 'configured_country',
    });
  }

  const ppOn = env.PAYPAL_ENABLED !== false && (ppCfg ? ppCfg.isEnabled !== false : true);
  if (ppOn) {
    if (ppCfg?.allowedCountries?.length > 0) {
      const allowed = new Set(ppCfg.allowedCountries.map((c) => normalizeCountry(c)));
      if (allowed.has(country)) {
        gateways.push({
          provider: 'paypal',
          currency: env.PAYPAL_CURRENCY || 'USD',
          mode: env.PAYPAL_MODE || 'sandbox',
          reason: 'configured_country',
        });
      }
    } else if (!INDIA.has(country)) {
      gateways.push({
        provider: 'paypal',
        currency: env.PAYPAL_CURRENCY || 'USD',
        mode: env.PAYPAL_MODE || 'sandbox',
        reason: 'international_billing_country',
      });
    }
  }

  let defaultGateway =
    gateways.find((g) => g.provider === preferredGateway)?.provider ||
    gateways.find((g) => g.provider === env.PAYMENT_DEFAULT_GATEWAY)?.provider ||
    gateways[0]?.provider ||
    null;

  return {
    billingCountry: country,
    gateways,
    defaultGateway,
  };
}

export async function assertGatewayAllowed({ gateway, billingCountry }) {
  const available = await listAvailableGateways({ billingCountry });
  if (!available.gateways.some((g) => g.provider === gateway)) {
    throw new AppError(
      `Gateway ${gateway} is not available for billing country ${available.billingCountry}`,
      400,
      'GATEWAY_NOT_AVAILABLE'
    );
  }
  return available;
}
