import { PaymentGatewayConfig } from '../../models/PaymentGatewayConfig.js';
import { env } from '../../config/env.js';
import {
  canEncryptSecrets,
  encryptSecret,
  maskSecret,
  decryptSecret,
} from '../../utils/secretCrypto.js';
import { AppError } from '../../utils/AppError.js';
import { getRazorpayCredentials, getRazorpayClient } from './razorpay.service.js';
import { getPayPalCredentials } from './paypal.service.js';

const MASK = '********';

function safeSecretUpdate(inputValue) {
  return (
    inputValue &&
    inputValue !== MASK &&
    !String(inputValue).includes('…') &&
    String(inputValue).length > 8
  );
}

export async function listGateways() {
  const [rzCfg, ppCfg] = await Promise.all([
    PaymentGatewayConfig.findOne({ provider: 'razorpay' }),
    PaymentGatewayConfig.findOne({ provider: 'paypal' }),
  ]);

  const rzKey = typeof env.RAZORPAY_KEY_ID === 'string' ? env.RAZORPAY_KEY_ID.trim() : '';
  const rzSecret =
    typeof env.RAZORPAY_KEY_SECRET === 'string' ? env.RAZORPAY_KEY_SECRET.trim() : '';
  const rzWebhook =
    typeof env.RAZORPAY_WEBHOOK_SECRET === 'string' ? env.RAZORPAY_WEBHOOK_SECRET.trim() : '';
  const rzEnv = Boolean(rzKey && rzSecret);

  const ppId = typeof env.PAYPAL_CLIENT_ID === 'string' ? env.PAYPAL_CLIENT_ID.trim() : '';
  const ppSecret =
    typeof env.PAYPAL_CLIENT_SECRET === 'string' ? env.PAYPAL_CLIENT_SECRET.trim() : '';
  const ppWebhook = typeof env.PAYPAL_WEBHOOK_ID === 'string' ? env.PAYPAL_WEBHOOK_ID.trim() : '';
  const ppEnv = Boolean(ppId && ppSecret);

  return {
    defaultGateway: env.PAYMENT_DEFAULT_GATEWAY || 'razorpay',
    gateways: [
      {
        provider: 'razorpay',
        envEnabled: env.RAZORPAY_ENABLED !== false,
        isEnabled: env.RAZORPAY_ENABLED !== false && (rzEnv || Boolean(rzCfg?.isEnabled)),
        mode: rzEnv ? env.RAZORPAY_MODE || 'test' : rzCfg?.mode || env.RAZORPAY_MODE || 'test',
        keyId: rzEnv ? maskSecret(rzKey) : rzCfg?.keyId ? maskSecret(rzCfg.keyId) : null,
        secretKeyConfigured: rzEnv || Boolean(rzCfg?.encryptedSecretKey),
        webhookSecretConfigured: Boolean(rzWebhook) || Boolean(rzCfg?.encryptedWebhookSecret),
        currency: 'INR',
        allowedCountries: rzCfg?.allowedCountries?.length ? rzCfg.allowedCountries : ['IN'],
        encryptionReady: canEncryptSecrets(),
        source: rzEnv ? 'environment' : rzCfg?.encryptedSecretKey ? 'database' : 'none',
        updatedAt: rzCfg?.updatedAt || null,
      },
      {
        provider: 'paypal',
        envEnabled: env.PAYPAL_ENABLED !== false,
        isEnabled: env.PAYPAL_ENABLED !== false && (ppEnv || Boolean(ppCfg?.isEnabled)),
        mode: ppEnv
          ? env.PAYPAL_MODE || 'sandbox'
          : ppCfg?.mode || env.PAYPAL_MODE || 'sandbox',
        clientId: ppEnv ? maskSecret(ppId) : ppCfg?.keyId ? maskSecret(ppCfg.keyId) : null,
        secretKeyConfigured: ppEnv || Boolean(ppCfg?.encryptedSecretKey),
        webhookIdConfigured: Boolean(ppWebhook) || Boolean(ppCfg?.webhookId),
        currency: env.PAYPAL_CURRENCY || 'USD',
        allowedCountries: ppCfg?.allowedCountries || [],
        encryptionReady: canEncryptSecrets(),
        source: ppEnv ? 'environment' : ppCfg?.encryptedSecretKey ? 'database' : 'none',
        updatedAt: ppCfg?.updatedAt || null,
      },
    ],
  };
}

async function upsertGateway(provider, req, input, mapFields) {
  if (!canEncryptSecrets() && (safeSecretUpdate(input.keySecret) || safeSecretUpdate(input.clientSecret))) {
    throw new AppError(
      'Set PAYMENT_SECRET_ENCRYPTION_KEY (32+ chars) before saving gateway secrets',
      400,
      'ENCRYPTION_KEY_MISSING'
    );
  }

  let cfg = await PaymentGatewayConfig.findOne({ provider });
  if (!cfg) cfg = new PaymentGatewayConfig({ provider });

  mapFields(cfg, input);

  cfg.configuredAt = new Date();
  cfg.updatedBy = req.user._id;
  cfg.configHistory = cfg.configHistory || [];
  cfg.configHistory.push({
    at: new Date(),
    actorId: req.user._id,
    action: 'config_updated',
    meta: {
      fields: Object.keys(input || {}).filter(
        (k) => !['keySecret', 'clientSecret', 'webhookSecret'].includes(k)
      ),
    },
  });
  await cfg.save();
  return listGateways();
}

export async function updateRazorpayConfig(req, input) {
  return upsertGateway('razorpay', req, input, (cfg, body) => {
    if (body.mode) {
      if (body.mode === 'live' && body.keyId && String(body.keyId).startsWith('rzp_test_')) {
        throw new AppError('Test key cannot be used in live mode', 400, 'MODE_KEY_MISMATCH');
      }
      cfg.mode = body.mode === 'sandbox' ? 'test' : body.mode;
    }
    if (body.isEnabled !== undefined) cfg.isEnabled = body.isEnabled;
    if (body.captureMode) cfg.captureMode = body.captureMode;
    if (body.currency) cfg.currency = body.currency;
    if (body.allowedCountries) cfg.allowedCountries = body.allowedCountries;
    if (body.keyId && body.keyId !== MASK && !String(body.keyId).includes('…')) {
      cfg.keyId = body.keyId;
    }
    if (safeSecretUpdate(body.keySecret)) {
      cfg.encryptedSecretKey = encryptSecret(body.keySecret);
    }
    if (safeSecretUpdate(body.webhookSecret)) {
      cfg.encryptedWebhookSecret = encryptSecret(body.webhookSecret);
    }
  });
}

export async function updatePayPalConfig(req, input) {
  return upsertGateway('paypal', req, input, (cfg, body) => {
    if (body.mode) {
      cfg.mode = body.mode === 'sandbox' ? 'sandbox' : body.mode === 'test' ? 'sandbox' : 'live';
    }
    if (body.isEnabled !== undefined) cfg.isEnabled = body.isEnabled;
    if (body.currency) cfg.currency = body.currency;
    if (body.allowedCountries) cfg.allowedCountries = body.allowedCountries;
    if (body.clientId && body.clientId !== MASK && !String(body.clientId).includes('…')) {
      cfg.keyId = body.clientId;
    }
    if (safeSecretUpdate(body.clientSecret)) {
      cfg.encryptedSecretKey = encryptSecret(body.clientSecret);
    }
    if (body.webhookId && body.webhookId !== MASK && !String(body.webhookId).includes('…')) {
      cfg.webhookId = body.webhookId;
    }
  });
}

export async function testRazorpayCredentials() {
  try {
    const creds = await getRazorpayCredentials();
    const client = await getRazorpayClient();
    void client;
    return {
      ok: true,
      mode: creds.mode,
      keyIdMasked: maskSecret(creds.keyId),
      message: 'Credentials loaded successfully',
    };
  } catch (err) {
    return { ok: false, message: err.message, code: err.code };
  }
}

export async function testPayPalCredentials() {
  try {
    const creds = await getPayPalCredentials();
    return {
      ok: true,
      mode: creds.mode,
      clientIdMasked: maskSecret(creds.clientId),
      message: 'Credentials loaded successfully',
    };
  } catch (err) {
    return { ok: false, message: err.message, code: err.code };
  }
}

export async function razorpayStatus() {
  const listed = await listGateways();
  const g = listed.gateways.find((x) => x.provider === 'razorpay');
  return {
    provider: 'razorpay',
    isEnabled: g.isEnabled,
    mode: g.mode,
    ready: g.secretKeyConfigured && Boolean(g.keyId),
    webhookConfigured: g.webhookSecretConfigured,
    source: g.source,
    encryptionReady: g.encryptionReady,
  };
}

export async function paypalStatus() {
  const listed = await listGateways();
  const g = listed.gateways.find((x) => x.provider === 'paypal');
  return {
    provider: 'paypal',
    isEnabled: g.isEnabled,
    mode: g.mode,
    ready: g.secretKeyConfigured && Boolean(g.clientId),
    webhookConfigured: g.webhookIdConfigured,
    source: g.source,
    encryptionReady: g.encryptionReady,
  };
}

export async function getWebhookSecret() {
  try {
    const creds = await getRazorpayCredentials();
    return creds.webhookSecret;
  } catch {
    return env.RAZORPAY_WEBHOOK_SECRET || '';
  }
}

void decryptSecret;
