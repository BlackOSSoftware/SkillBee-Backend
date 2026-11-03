import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { security, USER_STATUS } from '../config/security.js';
import { normalizePhone } from '../utils/phone.js';

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    profileImage: {
      type: String,
      default: null,
      trim: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      index: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    /** Role-specific profile payload (student education, etc.) */
    profile: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    refreshTokens: {
      type: [refreshTokenSchema],
      default: [],
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

userSchema.index({ deletedAt: 1, status: 1 });
userSchema.index({ email: 1, deletedAt: 1 });

userSchema.pre('validate', function normalizeFields(next) {
  if (this.phone) {
    this.phone = normalizePhone(this.phone);
  }
  next();
});

userSchema.methods.setPassword = async function setPassword(plainPassword) {
  this.passwordHash = await bcrypt.hash(plainPassword, security.bcryptRounds);
};

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.methods.isDeleted = function isDeleted() {
  return Boolean(this.deletedAt);
};

userSchema.methods.isActiveAccount = function isActiveAccount() {
  return this.status === USER_STATUS.ACTIVE && !this.deletedAt;
};

userSchema.methods.toSafeObject = function toSafeObject() {
  const role = this.roleId && typeof this.roleId === 'object' && this.roleId.slug
    ? {
        id: this.roleId._id?.toString?.() || this.roleId.id,
        name: this.roleId.name,
        slug: this.roleId.slug,
        permissions: this.roleId.permissions || [],
      }
    : this.roleId
      ? { id: this.roleId.toString() }
      : null;

  return {
    id: this._id.toString(),
    firstName: this.firstName,
    lastName: this.lastName,
    email: this.email,
    phone: this.phone,
    profileImage: this.profileImage,
    roleId: role?.id || (this.roleId ? this.roleId.toString() : null),
    role,
    status: this.status,
    emailVerified: this.emailVerified,
    phoneVerified: this.phoneVerified,
    lastLogin: this.lastLogin,
    profile: this.profile || {},
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    deletedAt: this.deletedAt,
  };
};

userSchema.statics.notDeletedFilter = function notDeletedFilter(extra = {}) {
  return { deletedAt: null, ...extra };
};

export const User = mongoose.model('User', userSchema);
