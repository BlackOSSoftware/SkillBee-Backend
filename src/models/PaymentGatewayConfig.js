import mongoose from 'mongoose';

const paymentGatewayConfigSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      enum: ['razorpay', 'paypal'],
      unique: true,
    },
    isEnabled: { type: Boolean, default: false },
    /** razorpay: test|live ; paypal stored as test(=sandbox)|live */
    mode: { type: String, enum: ['test', 'live', 'sandbox'], default: 'test' },
    keyId: { type: String, trim: true, default: '' },
    /** AES-GCM encrypted key secret / client secret */
    encryptedSecretKey: { type: String, default: '' },
    encryptedWebhookSecret: { type: String, default: '' },
    /** PayPal webhook ID (verification resource id) */
    webhookId: { type: String, trim: true, default: '' },
    captureMode: { type: String, enum: ['automatic', 'manual'], default: 'automatic' },
    currency: { type: String, default: 'INR' },
    /** ISO country codes this gateway serves; empty = use platform defaults */
    allowedCountries: { type: [String], default: [] },
    configuredAt: { type: Date, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    configHistory: [
      {
        at: { type: Date, default: Date.now },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        action: { type: String },
        meta: { type: mongoose.Schema.Types.Mixed, default: null },
      },
    ],
  },
  { timestamps: true, versionKey: false }
);

export const PaymentGatewayConfig = mongoose.model(
  'PaymentGatewayConfig',
  paymentGatewayConfigSchema
);
