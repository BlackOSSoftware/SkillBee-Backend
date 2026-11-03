import { z } from 'zod';
import { RESOURCE_TYPES } from '../../../models/CourseResource.js';
import { objectId } from './common.js';

export const createResourceMetaSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional(),
    resourceType: z.enum(RESOURCE_TYPES),
    topicId: objectId.nullable().optional(),
    lessonId: objectId.nullable().optional(),
    externalUrl: z.string().url().optional(),
    sortOrder: z.number().int().optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.resourceType === 'external_link' && !data.externalUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'externalUrl is required for external_link resources',
        path: ['externalUrl'],
      });
    }
  });

export const updateResourceSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    sortOrder: z.number().int().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    externalUrl: z.string().url().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const resourceIdParamSchema = z.object({ resourceId: objectId });
