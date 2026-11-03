import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]+$/, 'Slug must be lowercase letters, numbers, underscores')
    .optional(),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string().trim().min(1)).default([]),
  isActive: z.boolean().optional(),
});

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const assignPermissionsSchema = z.object({
  permissions: z.array(z.string().trim().min(1)).min(0),
});

export const roleIdParamSchema = z.object({
  id: objectId,
});
