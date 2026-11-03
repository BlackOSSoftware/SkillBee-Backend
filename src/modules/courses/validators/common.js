import { z } from 'zod';
import {
  COURSE_LEVELS,
  COURSE_STATUS,
  DURATION_UNITS,
  SUPPORTED_CURRENCIES,
} from '../../../config/security.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const cloudinaryMediaInput = z
  .object({
    provider: z.literal('cloudinary').optional(),
    publicId: z.string().min(1),
    secureUrl: z.string().url(),
    width: z.number().nonnegative().optional(),
    height: z.number().nonnegative().optional(),
    format: z.string().optional(),
    bytes: z.number().nonnegative().optional(),
  })
  .strict();

export const pricingInput = z
  .object({
    type: z.enum(['free', 'paid']),
    regularPrice: z.number().nonnegative().optional(),
    salePrice: z.number().nonnegative().nullable().optional(),
    currency: z.enum(SUPPORTED_CURRENCIES).optional(),
    saleStartAt: z.coerce.date().nullable().optional(),
    saleEndAt: z.coerce.date().nullable().optional(),
    isPurchasable: z.boolean().optional(),
    automaticEnrollmentEnabled: z.boolean().optional(),
    taxConfiguration: z
      .object({
        taxEnabled: z.boolean().optional(),
        taxPercent: z.number().min(0).max(100).optional(),
        taxClass: z.string().max(50).optional(),
        taxInclusive: z.boolean().optional(),
      })
      .strict()
      .optional(),
    purchaseAvailability: z
      .object({
        enabled: z.boolean().optional(),
        startAt: z.coerce.date().nullable().optional(),
        endAt: z.coerce.date().nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.type === 'free') {
      if ((data.regularPrice ?? 0) > 0 || (data.salePrice ?? 0) > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Free courses must have zero effective price',
          path: ['regularPrice'],
        });
      }
    }
    if (data.type === 'paid') {
      if (!(data.regularPrice > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Paid courses require regularPrice > 0',
          path: ['regularPrice'],
        });
      }
    }
    if (data.salePrice != null && data.regularPrice != null && data.salePrice > data.regularPrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Sale price cannot exceed regular price',
        path: ['salePrice'],
      });
    }
    if (data.saleStartAt && data.saleEndAt && data.saleStartAt > data.saleEndAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Sale start must be before sale end',
        path: ['saleEndAt'],
      });
    }
  });

export const seoInput = z
  .object({
    metaTitle: z.string().max(120).optional(),
    metaDescription: z.string().max(300).optional(),
    canonicalUrl: z.string().url().or(z.literal('')).optional(),
    noIndex: z.boolean().optional(),
    ogTitle: z.string().max(120).optional(),
    ogDescription: z.string().max(300).optional(),
    ogImage: z.string().optional(),
    focusKeyword: z.string().max(100).optional(),
  })
  .strict();

export { COURSE_LEVELS, COURSE_STATUS, DURATION_UNITS };
