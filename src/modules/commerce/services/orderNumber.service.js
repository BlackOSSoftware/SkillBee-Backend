import { env } from '../../../config/env.js';
import { OrderCounter } from '../../../models/OrderCounter.js';

export async function allocateOrderNumber(now = new Date()) {
  const year = now.getUTCFullYear();
  const prefix = (env.ORDER_NUMBER_PREFIX || 'SKB-ORD').toUpperCase();
  const key = `${prefix}:${year}`;
  const counter = await OrderCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return `${prefix}-${year}-${String(counter.seq).padStart(6, '0')}`;
}

export async function allocateInvoiceNumber(now = new Date()) {
  const year = now.getUTCFullYear();
  const prefix = (env.INVOICE_NUMBER_PREFIX || 'SKB-INV').toUpperCase();
  const key = `${prefix}:${year}`;
  const counter = await OrderCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return `${prefix}-${year}-${String(counter.seq).padStart(6, '0')}`;
}
