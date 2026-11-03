import { env } from '../../../config/env.js';
import { CertificateCounter } from '../../../models/CertificateCounter.js';

/**
 * Atomically allocate next certificate number for the current UTC year.
 * Never based on document count. Never reuses numbers.
 */
export async function allocateCertificateNumber(now = new Date()) {
  const year = now.getUTCFullYear();
  const prefix = (env.CERTIFICATE_NUMBER_PREFIX || 'SKB').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const key = `${prefix}:${year}`;

  const counter = await CertificateCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const seq = String(counter.seq).padStart(6, '0');
  return `${prefix}-${year}-${seq}`;
}
