import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../../config/env.js';
import { PaymentGatewayConfig } from '../../models/PaymentGatewayConfig.js';
import { decryptSecret, canEncryptSecrets } from '../../utils/secretCrypto.js';
import { AppError } from '../../utils/AppError.js';

let razorpayFactory = null;

export function setRazorpayFactoryForTests(factory) {
  razorpayFactory = factory;
}

function trimEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function assertModeMatchesKeyId(mode, keyId) {
  const id = String(keyId || '');
  const m = mode === 'live' ? 'live' : 'test';
  if (m === 'live' && id.startsWith('rzp_test_')) {
    throw new AppError(
      'Test Razorpay Key Id cannot be used when RAZORPAY_MODE=live',
      400,
      'MODE_KEY_MISMATCH'
    );
  }
  if (m === 'test' && id.startsWith('rzp_live_')) {
    throw new AppError(
      'Live Razorpay Key Id cannot be used when RAZORPAY_MODE=test',
      400,
      'MODE_KEY_MISMATCH'
    );
  }
}

export function assertPaymentCredentials(creds) {
  if (!creds?.keyId || !creds?.keySecret) {
    throw new AppError(
      'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.',
      503,
      'GATEWAY_NOT_CONFIGURED'
    );
  }
  assertModeMatchesKeyId(creds.mode, creds.keyId);
  return creds;
}

function credentialsFromEnv() {
  if (env.RAZORPAY_ENABLED === false) return null;
  const keyId = trimEnv(env.RAZORPAY_KEY_ID);
  const keySecret = trimEnv(env.RAZORPAY_KEY_SECRET);
  const webhookSecret = trimEnv(env.RAZORPAY_WEBHOOK_SECRET);
  if (!keyId || !keySecret) return null;
  return {
    keyId,
    keySecret,
    webhookSecret,
    mode: env.RAZORPAY_MODE === 'live' ? 'live' : 'test',
    currency: 'INR',
    source: 'env',
  };
}

async function credentialsFromDatabase() {
  if (env.RAZORPAY_ENABLED === false) return null;
  const cfg = await PaymentGatewayConfig.findOne({ provider: 'razorpay' }).lean();
  if (!cfg?.isEnabled || !cfg.keyId || !cfg.encryptedSecretKey) return null;
  if (!canEncryptSecrets()) {
    throw new AppError('Encryption key missing for payment secrets', 500, 'ENCRYPTION_KEY_MISSING');
  }
  return {
    keyId: cfg.keyId,
    keySecret: decryptSecret(cfg.encryptedSecretKey),
    webhookSecret: cfg.encryptedWebhookSecret
      ? decryptSecret(cfg.encryptedWebhookSecret)
      : '',
    mode: cfg.mode === 'live' ? 'live' : 'test',
    currency: cfg.currency || 'INR',
    source: 'db',
  };
}

export async function getRazorpayCredentials() {
  if (env.RAZORPAY_ENABLED === false) {
    throw new AppError('Razorpay is disabled', 503, 'GATEWAY_DISABLED');
  }
  const fromEnv = credentialsFromEnv();
  if (fromEnv) return assertPaymentCredentials(fromEnv);
  const fromDb = await credentialsFromDatabase();
  if (fromDb) return assertPaymentCredentials(fromDb);
  throw new AppError(
    'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.',
    503,
    'GATEWAY_NOT_CONFIGURED'
  );
}

export async function isRazorpayConfigured() {
  try {
    await getRazorpayCredentials();
    return true;
  } catch {
    return false;
  }
}

export async function getRazorpayClient() {
  if (razorpayFactory) return razorpayFactory();
  const creds = await getRazorpayCredentials();
  return new Razorpay({ key_id: creds.keyId, key_secret: creds.keySecret });
}

export async function createRazorpayOrder({ amountPaise, currency, receipt, notes = {} }) {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new AppError('Invalid payment amount', 400, 'INVALID_AMOUNT');
  }
  const client = await getRazorpayClient();
  return client.orders.create({
    amount: amountPaise,
    currency: currency || 'INR',
    receipt,
    notes,
  });
}

export function verifyPaymentSignature({ orderId, paymentId, signature, keySecret }) {
  if (!keySecret) return false;
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!webhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function fetchRazorpayPayment(paymentId) {
  const client = await getRazorpayClient();
  return client.payments.fetch(paymentId);
}

export async function createRazorpayRefund({ paymentId, amountPaise, notes = {} }) {
  const client = await getRazorpayClient();
  return client.payments.refund(paymentId, { amount: amountPaise, notes });
}
