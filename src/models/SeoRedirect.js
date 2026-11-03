import mongoose from 'mongoose';

const seoRedirectSchema = new mongoose.Schema(
  {
    sourcePath: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    destinationPath: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    redirectType: {
      type: Number,
      enum: [301, 302],
      default: 301,
    },
    isActive: { type: Boolean, default: true, index: true },
    hitCount: { type: Number, min: 0, default: 0 },
    lastAccessedAt: { type: Date, default: null },
    allowExternal: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
    auditLog: [
      {
        action: { type: String, required: true },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        at: { type: Date, default: Date.now },
        meta: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
    ],
  },
  { timestamps: true, versionKey: false }
);

seoRedirectSchema.index(
  { sourcePath: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true, deletedAt: null },
  }
);
seoRedirectSchema.index({ isActive: 1, redirectType: 1, createdAt: -1 });

seoRedirectSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    sourcePath: this.sourcePath,
    destinationPath: this.destinationPath,
    redirectType: this.redirectType,
    isActive: this.isActive,
    hitCount: this.hitCount,
    lastAccessedAt: this.lastAccessedAt,
    allowExternal: this.allowExternal,
    createdBy: this.createdBy?.toString?.() || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const SeoRedirect = mongoose.model('SeoRedirect', seoRedirectSchema);
