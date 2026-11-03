import nodemailer from 'nodemailer';
import { env } from './env.js';

let transporter = null;
let initError = null;
let verified = false;

export function getSmtpStatus() {
  return {
    enabled: env.EMAIL_ENABLED,
    configured: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM_EMAIL),
    ready: Boolean(transporter),
    verified,
    host: env.SMTP_HOST || null,
    port: env.SMTP_PORT || null,
    error: initError ? String(initError.message || initError) : null,
  };
}

export function getMailTransporter() {
  if (!env.EMAIL_ENABLED) return null;
  if (transporter) return transporter;

  const status = getSmtpStatus();
  if (!status.configured) {
    initError = new Error('SMTP credentials incomplete');
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
    });
    initError = null;
    return transporter;
  } catch (err) {
    initError = err;
    if (env.NODE_ENV !== 'test') {
      console.warn('[smtp] init failed:', err.message);
    }
    return null;
  }
}

export async function verifySmtpConnection() {
  const t = getMailTransporter();
  if (!t) {
    verified = false;
    return { ok: false, ...getSmtpStatus() };
  }
  try {
    await t.verify();
    verified = true;
    return { ok: true, ...getSmtpStatus() };
  } catch (err) {
    verified = false;
    initError = err;
    return { ok: false, ...getSmtpStatus() };
  }
}

export function _setTransporterForTests(mock) {
  transporter = mock;
  verified = true;
  initError = null;
}

export function _resetSmtpForTests() {
  transporter = null;
  verified = false;
  initError = null;
}
