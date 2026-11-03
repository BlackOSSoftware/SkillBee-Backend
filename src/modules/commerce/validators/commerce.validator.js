import { z } from 'zod';
import { ORDER_STATUSES, PAYMENT_STATUSES } from '../../../models/Order.js';

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId');

const billing = z
  .object({
    fullName: z.string().trim().max(200).optional(),
    email: z.string().email().optional(),
    phone: z.string().trim().max(40).optional(),
    addressLine1: z.string().trim().max(300).optional(),
    addressLine2: z.string().trim().max(300).optional(),
    city: z.string().trim().max(100).optional(),
    state: z.string().trim().max(100).optional(),
    postalCode: z.string().trim().max(20).optional(),
    country: z.string().trim().max(100).optional(),
    gstin: z.string().trim().max(30).optional(),
  })
  .strict()
  .optional();

export const cartItemBody = z
  .object({
    courseId: objectId,
  })
  .strict();

export const courseIdParams = z.object({ courseId: objectId });
export const studentIdParams = z.object({ studentId: objectId });
export const idParams = z.object({ id: objectId });
export const orderIdParams = z.object({ orderId: objectId });

export const checkoutBody = z
  .object({
    courseIds: z.array(objectId).min(1).max(20).optional(),
    useCart: z.boolean().optional(),
    clearCart: z.boolean().optional(),
    couponCode: z.string().trim().max(40).optional(),
    billing: billing,
  })
  .strict()
  .refine((v) => v.useCart || (v.courseIds && v.courseIds.length), {
    message: 'courseIds or useCart required',
  });

export const createPaymentBody = z
  .object({
    orderId: objectId,
  })
  .strict();

export const verifyPaymentBody = z
  .object({
    orderId: objectId,
    razorpay_order_id: z.string().min(3),
    razorpay_payment_id: z.string().min(3),
    razorpay_signature: z.string().min(10),
  })
  .strict();

export const orderStatusBody = z
  .object({
    status: z.enum(ORDER_STATUSES),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();

export const orderListQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  orderStatus: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  studentId: objectId.optional(),
  courseId: objectId.optional(),
  orderNumber: z.string().optional(),
  search: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const refundBody = z
  .object({
    amountPaise: z.number().int().positive().optional(),
    reason: z.string().trim().max(2000).optional(),
    revokeEnrollment: z.boolean().optional(),
    idempotencyKey: z.string().max(100).optional(),
  })
  .strict();

export const gatewayUpdateBody = z
  .object({
    isEnabled: z.boolean().optional(),
    mode: z.enum(['test', 'live', 'sandbox']).optional(),
    keyId: z.string().trim().max(100).optional(),
    keySecret: z.string().trim().max(200).optional(),
    webhookSecret: z.string().trim().max(200).optional(),
    captureMode: z.enum(['automatic', 'manual']).optional(),
    currency: z.string().trim().max(10).optional(),
    allowedCountries: z.array(z.string().trim().max(5)).max(50).optional(),
  })
  .strict();

export const paypalGatewayUpdateBody = z
  .object({
    isEnabled: z.boolean().optional(),
    mode: z.enum(['sandbox', 'live', 'test']).optional(),
    clientId: z.string().trim().max(200).optional(),
    clientSecret: z.string().trim().max(200).optional(),
    webhookId: z.string().trim().max(200).optional(),
    currency: z.string().trim().max(10).optional(),
    allowedCountries: z.array(z.string().trim().max(5)).max(50).optional(),
  })
  .strict();

export const capturePayPalBody = z
  .object({
    orderId: objectId,
    paypalOrderId: z.string().min(3).optional(),
  })
  .strict();
