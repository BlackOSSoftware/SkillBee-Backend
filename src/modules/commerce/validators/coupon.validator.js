import { z } from 'zod';

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId');

export const couponIdParams = z.object({ id: objectId });

export const createCouponBody = z
  .object({
    code: z.string().trim().min(3).max(40),
    description: z.string().trim().max(500).optional(),
    discountType: z.enum(['percentage', 'fixed', 'percent']),
    discountValue: z.number().min(0),
    currency: z.string().trim().max(10).optional(),
    minimumOrderAmount: z.number().min(0).optional(),
    maximumDiscountAmount: z.number().min(0).nullable().optional(),
    usageLimit: z.number().int().min(0).nullable().optional(),
    perUserLimit: z.number().int().min(0).nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    expiryDate: z.coerce.date().nullable().optional(),
    applicability: z.enum(['all_courses', 'selected_courses']).optional(),
    applicableCourses: z.array(objectId).max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const type = val.discountType === 'percent' ? 'percentage' : val.discountType;
    if (type === 'percentage' && val.discountValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'percentage discount cannot exceed 100',
        path: ['discountValue'],
      });
    }
    if (val.startDate && val.expiryDate && val.expiryDate <= val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'expiryDate must be after startDate',
        path: ['expiryDate'],
      });
    }
    if (
      (val.applicability === 'selected_courses' ||
        (val.applicableCourses && val.applicableCourses.length > 0)) &&
      val.applicability !== 'all_courses' &&
      !(val.applicableCourses && val.applicableCourses.length)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'applicableCourses required for selected_courses',
        path: ['applicableCourses'],
      });
    }
  });

export const updateCouponBody = z
  .object({
    code: z.string().trim().min(3).max(40).optional(),
    description: z.string().trim().max(500).optional(),
    discountType: z.enum(['percentage', 'fixed', 'percent']).optional(),
    discountValue: z.number().min(0).optional(),
    currency: z.string().trim().max(10).optional(),
    minimumOrderAmount: z.number().min(0).optional(),
    maximumDiscountAmount: z.number().min(0).nullable().optional(),
    usageLimit: z.number().int().min(0).nullable().optional(),
    perUserLimit: z.number().int().min(0).nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    expiryDate: z.coerce.date().nullable().optional(),
    applicability: z.enum(['all_courses', 'selected_courses']).optional(),
    applicableCourses: z.array(objectId).max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const couponListQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  isActive: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  expired: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  upcoming: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  discountType: z.enum(['percentage', 'fixed', 'percent']).optional(),
});

export const couponUsageQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(['reserved', 'consumed', 'released', 'failed']).optional(),
});

export const validateCouponBody = z
  .object({
    couponCode: z.string().trim().min(1).max(40),
    courseIds: z.array(objectId).min(1).max(20),
  })
  .strict();
