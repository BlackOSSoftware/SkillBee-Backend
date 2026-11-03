import { z } from 'zod';
import { DEVICE_PLATFORMS } from '../../../models/DeviceToken.js';
import { objectId } from '../../courses/validators/common.js';

export const registerDeviceBody = z
  .object({
    token: z.string().trim().min(20).max(512),
    platform: z.enum(DEVICE_PLATFORMS).default('web'),
    deviceName: z.string().trim().max(120).optional(),
  })
  .strict();

export const adminNotificationBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(2000),
    recipientType: z.enum([
      'all_students',
      'selected_students',
      'selected_course_students',
      'selected_users',
    ]),
    recipientIds: z.array(objectId).max(5000).optional(),
    courseId: objectId.optional(),
    deliveryChannel: z.enum(['in_app', 'push', 'both']).default('both'),
    type: z.enum(['custom', 'course_announcement']).optional(),
    category: z.string().trim().max(80).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (
      (val.recipientType === 'selected_students' || val.recipientType === 'selected_users') &&
      !(val.recipientIds && val.recipientIds.length)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'recipientIds required',
        path: ['recipientIds'],
      });
    }
    if (val.recipientType === 'selected_course_students' && !val.courseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'courseId required',
        path: ['courseId'],
      });
    }
  });

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isRead: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  type: z.string().optional(),
  recipientId: objectId.optional(),
});

export const idParam = z.object({ id: objectId });
