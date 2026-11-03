import mongoose from 'mongoose';

export const REFERRAL_STATUS = Object.freeze({
  PENDING: 'pending',
  CONTACTED: 'contacted',
  CONVERTED: 'converted',
  REJECTED: 'rejected',
});

const referralSchema = new mongoose.Schema(
  {
    referrerName: { type: String, required: true, trim: true, maxlength: 120 },
    referrerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      index: true,
    },
    referrerPhone: { type: String, required: true, trim: true, maxlength: 30, index: true },
    friendName: { type: String, required: true, trim: true, maxlength: 120 },
    friendPhone: { type: String, required: true, trim: true, maxlength: 30, index: true },
    message: { type: String, trim: true, maxlength: 2000, default: '' },
    status: {
      type: String,
      enum: Object.values(REFERRAL_STATUS),
      default: REFERRAL_STATUS.PENDING,
      index: true,
    },
    adminNotes: { type: String, trim: true, maxlength: 5000, default: '' },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

referralSchema.index({ createdAt: -1 });
referralSchema.index({ status: 1, createdAt: -1 });

referralSchema.methods.toPublicReceipt = function toPublicReceipt() {
  return {
    reference: this._id.toString().slice(-8).toUpperCase(),
    status: this.status,
    submittedAt: this.createdAt,
  };
};

referralSchema.methods.toAdminObject = function toAdminObject() {
  return {
    id: this._id.toString(),
    referrerName: this.referrerName,
    referrerEmail: this.referrerEmail,
    referrerPhone: this.referrerPhone,
    friendName: this.friendName,
    friendPhone: this.friendPhone,
    message: this.message,
    status: this.status,
    adminNotes: this.adminNotes,
    handledBy: this.handledBy?.toString?.() || null,
    handledAt: this.handledAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const Referral = mongoose.model('Referral', referralSchema);
