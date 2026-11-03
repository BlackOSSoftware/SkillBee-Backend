import mongoose from 'mongoose';

const orderCounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false }
);

export const OrderCounter = mongoose.model('OrderCounter', orderCounterSchema);
