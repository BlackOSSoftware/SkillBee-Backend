import crypto from 'crypto';
import { env } from '../config/env.js';
import { AppError } from './AppError.js';

function getKey() {
  const raw = env.PAYMENT_SECRET_ENCRYPTION_KEY || '';
  if (!raw || raw.length < 32) {
    throw new AppError(
      'PAYMENT_SECRET_ENCRYPTION_KEY must be at least 32 characters to store gateway secrets',
      500,
      'ENCRYPTION_KEY_MISSING'
    );
  }
  // Derive 32-byte key
  return crypto.createHash('sha256').update(raw).digest();
}

/** Encrypt plaintext → `iv:tag:ciphertext` hex */
export function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return '';
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(payload) {
  if (!payload) return '';
  const key = getKey();
  const [ivHex, tagHex, dataHex] = String(payload).split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new AppError('Invalid encrypted secret format', 500, 'SECRET_DECRYPT_FAILED');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

export function maskSecret(value) {
  if (!value) return null;
  const s = String(value);
  if (s.length <= 8) return '********';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function canEncryptSecrets() {
  return Boolean(env.PAYMENT_SECRET_ENCRYPTION_KEY && env.PAYMENT_SECRET_ENCRYPTION_KEY.length >= 32);
}
