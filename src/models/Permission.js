import mongoose from 'mongoose';
import { PERMISSION_CATALOG } from '../config/security.js';

const permissionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    module: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

permissionSchema.statics.ensureDefaults = async function ensureDefaults() {
  await Promise.all(
    PERMISSION_CATALOG.map((item) =>
      this.findOneAndUpdate(
        { code: item.code },
        {
          code: item.code,
          name: item.name,
          module: item.module,
          description: item.description || item.name,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    )
  );
};

permissionSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    code: this.code,
    name: this.name,
    module: this.module,
    description: this.description,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const Permission = mongoose.model('Permission', permissionSchema);
