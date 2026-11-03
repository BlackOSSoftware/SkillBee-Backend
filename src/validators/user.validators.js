import { z } from 'zod';
import { USER_STATUS } from '../config/security.js';
import { passwordSchema, phoneSchema } from './auth.validators.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(Object.values(USER_STATUS)).optional(),
  roleId: objectId.optional(),
  role: z.string().trim().toLowerCase().optional(),
  includeDeleted: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const createUserSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().toLowerCase(),
  phone: phoneSchema,
  password: passwordSchema,
  roleId: objectId,
  status: z.enum(Object.values(USER_STATUS)).optional(),
  profileImage: z.string().url().optional().nullable(),
  profile: z.record(z.any()).optional(),
  emailVerified: z.boolean().optional(),
  phoneVerified: z.boolean().optional(),
});

export const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    email: z.string().trim().email().toLowerCase().optional(),
    phone: phoneSchema,
    password: passwordSchema.optional(),
    roleId: objectId.optional(),
    profileImage: z.string().url().optional().nullable(),
    profile: z.record(z.any()).optional(),
    emailVerified: z.boolean().optional(),
    phoneVerified: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const updateUserStatusSchema = z.object({
  status: z.enum(Object.values(USER_STATUS)),
});

export const userIdParamSchema = z.object({
  id: objectId,
});
