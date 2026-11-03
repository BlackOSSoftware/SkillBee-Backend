import mongoose from 'mongoose';

export const DEVICE_PLATFORMS = Object.freeze(['web', 'android', 'ios']);

const deviceTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    token: { type: String, required: true, trim: true, maxlength: 512 },
    platform: {
      type: String,
      enum: DEVICE_PLATFORMS,
      default: 'web',
    },
    deviceName: { type: String, trim: true, maxlength: 120, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

deviceTokenSchema.index(
  { token: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);
deviceTokenSchema.index({ userId: 1, isActive: 1 });

deviceTokenSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    userId: this.userId.toString(),
    platform: this.platform,
    deviceName: this.deviceName || '',
    isActive: this.isActive,
    lastUsedAt: this.lastUsedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    // Never expose full FCM token in list responses beyond truncated hint
    tokenHint: this.token ? `${this.token.slice(0, 8)}…` : '',
  };
};

export const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema);
