import { env } from '../../config/env.js';
import { PaymentGatewayConfig } from '../../models/PaymentGatewayConfig.js';
import { decryptSecret, canEncryptSecrets } from '../../utils/secretCrypto.js';
import { AppError } from '../../utils/AppError.js';

/** Injectable HTTP client for tests: async (path, options) => responseJson */
let paypalHttpFactory = null;
let cachedToken = null;

export function setPayPalHttpForTests(factory) {
  paypalHttpFactory = factory;
  cachedToken = null;
}

function trimEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function apiBase(mode) {
  return mode === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

export function assertPayPalCredentials(creds) {
  if (!creds?.clientId || !creds?.clientSecret) {
    throw new AppError(
      'PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.',
      503,
      'GATEWAY_NOT_CONFIGURED'
    );
  }
  return creds;
}

function credentialsFromEnv() {
  if (env.PAYPAL_ENABLED === false) return null;
  const clientId = trimEnv(env.PAYPAL_CLIENT_ID);
  const clientSecret = trimEnv(env.PAYPAL_CLIENT_SECRET);
  const webhookId = trimEnv(env.PAYPAL_WEBHOOK_ID);
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    webhookId,
    mode: env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox',
    currency: env.PAYPAL_CURRENCY || 'USD',
    source: 'env',
  };
}

async function credentialsFromDatabase() {
  if (env.PAYPAL_ENABLED === false) return null;
  const cfg = await PaymentGatewayConfig.findOne({ provider: 'paypal' }).lean();
  if (!cfg?.isEnabled || !cfg.keyId || !cfg.encryptedSecretKey) return null;
  if (!canEncryptSecrets()) {
    throw new AppError('Encryption key missing for payment secrets', 500, 'ENCRYPTION_KEY_MISSING');
  }
  return {
    clientId: cfg.keyId,
    clientSecret: decryptSecret(cfg.encryptedSecretKey),
    webhookId: cfg.webhookId || '',
    mode: cfg.mode === 'live' ? 'live' : 'sandbox',
    currency: cfg.currency || env.PAYPAL_CURRENCY || 'USD',
    source: 'db',
  };
}

export async function getPayPalCredentials() {
  if (env.PAYPAL_ENABLED === false) {
    throw new AppError('PayPal is disabled', 503, 'GATEWAY_DISABLED');
  }
  const fromEnv = credentialsFromEnv();
  if (fromEnv) return assertPayPalCredentials(fromEnv);
  const fromDb = await credentialsFromDatabase();
  if (fromDb) return assertPayPalCredentials(fromDb);
  throw new AppError(
    'PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.',
    503,
    'GATEWAY_NOT_CONFIGURED'
  );
}

async function paypalFetch(path, { method = 'GET', body, accessToken, creds } = {}) {
  if (paypalHttpFactory) {
    return paypalHttpFactory(path, { method, body, accessToken, creds });
  }
  const base = apiBase(creds.mode);
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.message || json?.error_description || `PayPal HTTP ${res.status}`;
    throw new AppError(msg, 502, 'PAYPAL_API_ERROR');
  }
  return json;
}

export async function getPayPalAccessToken() {
  const creds = await getPayPalCredentials();
  if (
    cachedToken &&
    cachedToken.clientId === creds.clientId &&
    cachedToken.expiresAt > Date.now() + 30_000
  ) {
    return { accessToken: cachedToken.accessToken, creds };
  }

  if (paypalHttpFactory) {
    const tokenJson = await paypalHttpFactory('/v1/oauth2/token', {
      method: 'POST',
      form: true,
      creds,
    });
    const accessToken = tokenJson.access_token;
    cachedToken = {
      clientId: creds.clientId,
      accessToken,
      expiresAt: Date.now() + (Number(tokenJson.expires_in) || 300) * 1000,
    };
    return { accessToken, creds };
  }

  const base = apiBase(creds.mode);
  const auth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new AppError('PayPal authentication failed', 502, 'PAYPAL_AUTH_FAILED');
  }
  cachedToken = {
    clientId: creds.clientId,
    accessToken: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 300) * 1000,
  };
  return { accessToken: json.access_token, creds };
}

/**
 * amountMinor = cents for USD. value string for PayPal is major units with 2 decimals.
 */
export function minorToPayPalValue(amountMinor) {
  return (amountMinor / 100).toFixed(2);
}

export async function createPayPalOrder({
  amountMinor,
  currency,
  receipt,
  returnUrl,
  cancelUrl,
  customId,
  description,
}) {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new AppError('Invalid payment amount', 400, 'INVALID_AMOUNT');
  }
  const { accessToken, creds } = await getPayPalAccessToken();
  const value = minorToPayPalValue(amountMinor);
  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: String(receipt).slice(0, 127),
        custom_id: customId ? String(customId).slice(0, 127) : undefined,
        description: description ? String(description).slice(0, 127) : undefined,
        amount: {
          currency_code: currency || creds.currency || 'USD',
          value,
        },
      },
    ],
    application_context: {
      brand_name: 'SkillBee',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
      return_url: returnUrl || `${env.FRONTEND_BASE_URL}/checkout/paypal/return`,
      cancel_url: cancelUrl || `${env.FRONTEND_BASE_URL}/checkout/paypal/cancel`,
    },
  };
  const order = await paypalFetch('/v2/checkout/orders', {
    method: 'POST',
    body: payload,
    accessToken,
    creds,
  });
  const approve = (order.links || []).find((l) => l.rel === 'approve');
  return {
    id: order.id,
    status: order.status,
    approveUrl: approve?.href || null,
    links: order.links || [],
    raw: order,
  };
}

export async function capturePayPalOrder(paypalOrderId) {
  const { accessToken, creds } = await getPayPalAccessToken();
  const captured = await paypalFetch(`/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    body: {},
    accessToken,
    creds,
  });
  return captured;
}

export async function getPayPalOrder(paypalOrderId) {
  const { accessToken, creds } = await getPayPalAccessToken();
  return paypalFetch(`/v2/checkout/orders/${paypalOrderId}`, {
    method: 'GET',
    accessToken,
    creds,
  });
}

export async function createPayPalRefund({ captureId, amountMinor, currency, note }) {
  const { accessToken, creds } = await getPayPalAccessToken();
  const body = {};
  if (amountMinor != null) {
    body.amount = {
      value: minorToPayPalValue(amountMinor),
      currency_code: currency || creds.currency || 'USD',
    };
  }
  if (note) body.note_to_payer = String(note).slice(0, 255);
  return paypalFetch(`/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    body,
    accessToken,
    creds,
  });
}

/**
 * Verify webhook using PayPal verify-webhook-signature API.
 * transmission fields come from PayPal request headers.
 */
export async function verifyPayPalWebhook({
  headers,
  webhookEvent,
}) {
  const creds = await getPayPalCredentials();
  if (!creds.webhookId) {
    throw new AppError(
      'PayPal webhook id is not configured. Set PAYPAL_WEBHOOK_ID in .env.',
      503,
      'WEBHOOK_ID_MISSING'
    );
  }
  const { accessToken } = await getPayPalAccessToken();
  const transmissionId = headers['paypal-transmission-id'] || headers['PayPal-Transmission-Id'];
  const transmissionTime =
    headers['paypal-transmission-time'] || headers['PayPal-Transmission-Time'];
  const certUrl = headers['paypal-cert-url'] || headers['PayPal-Cert-Url'];
  const authAlgo = headers['paypal-auth-algo'] || headers['PayPal-Auth-Algo'];
  const transmissionSig =
    headers['paypal-transmission-sig'] || headers['PayPal-Transmission-Sig'];

  if (!transmissionId || !transmissionSig || !certUrl || !authAlgo || !transmissionTime) {
    throw new AppError('Missing PayPal webhook transmission headers', 400, 'INVALID_WEBHOOK');
  }

  const result = await paypalFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    accessToken,
    creds,
    body: {
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: authAlgo,
      transmission_sig: transmissionSig,
      webhook_id: creds.webhookId,
      webhook_event: webhookEvent,
    },
  });

  return result?.verification_status === 'SUCCESS';
}

export function extractCaptureFromPayPalOrder(orderJson) {
  const units = orderJson?.purchase_units || [];
  const captures = units.flatMap((u) => u.payments?.captures || []);
  const capture = captures[0] || null;
  const amount = capture?.amount || units[0]?.amount;
  return {
    captureId: capture?.id || null,
    status: capture?.status || orderJson?.status,
    amountValue: amount?.value,
    currency: amount?.currency_code,
    customId: units[0]?.custom_id || null,
    referenceId: units[0]?.reference_id || null,
  };
}

export function payPalValueToMinor(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
