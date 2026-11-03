import mongoose from 'mongoose';

export const cloudinaryMediaSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['cloudinary'], default: 'cloudinary' },
    publicId: { type: String, required: true, trim: true },
    secureUrl: { type: String, required: true, trim: true },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    format: { type: String, trim: true },
    bytes: { type: Number, min: 0 },
  },
  { _id: false }
);
