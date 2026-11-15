import mongoose from 'mongoose';
import { DEFAULT_ROLES } from '../config/security.js';

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

roleSchema.statics.ensureDefaults = async function ensureDefaults() {
  await Promise.all(
    DEFAULT_ROLES.map((role) =>
      this.findOneAndUpdate(
        { slug: role.slug },
        {
          $set: {
            name: role.name,
            slug: role.slug,
            description: role.description,
            isSystem: role.isSystem,
            isActive: true,
          },
          // Permissions are only seeded on first insert — admin-assigned
          // permission changes must survive server restarts.
          $setOnInsert: { permissions: role.permissions },
        },
        { upsert: true, new: true }
      )
    )
  );
};

roleSchema.statics.findBySlug = function findBySlug(slug) {
  return this.findOne({ slug: String(slug).toLowerCase(), isActive: true });
};

roleSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    slug: this.slug,
    description: this.description,
    permissions: this.permissions,
    isSystem: this.isSystem,
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const Role = mongoose.model('Role', roleSchema);
