import { z } from 'zod';
import { ALLOWED_TEMPLATE_VARS } from '../services/emailTemplate.service.js';
import { objectId } from '../../courses/validators/common.js';

export const createTemplateBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().trim().min(2).max(80).optional(),
    subject: z.string().trim().min(1).max(200),
    htmlBody: z.string().min(1).max(50000),
    textBody: z.string().min(1).max(20000),
    variables: z.array(z.enum(ALLOWED_TEMPLATE_VARS)).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateTemplateBody = createTemplateBody.partial().strict();

export const templateStatusBody = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const emailLogQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  recipient: z.string().trim().email().optional(),
  status: z.enum(['queued', 'processing', 'sent', 'failed']).optional(),
  eventType: z.string().trim().max(80).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const idParam = z.object({ id: z.string().trim().min(1).max(100) });
export const objectIdParam = z.object({ id: objectId });
