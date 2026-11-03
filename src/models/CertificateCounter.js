import mongoose from 'mongoose';

/**
 * Atomic year-scoped sequence for certificate numbers.
 * Format: {PREFIX}-{YEAR}-{NNNNNN} e.g. SKB-2026-000001
 * Numbers are never reused; revoked certificates keep their number.
 */
const certificateCounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false }
);

export const CertificateCounter = mongoose.model(
  'CertificateCounter',
  certificateCounterSchema
);
