import { z } from 'zod';
import { cloudinaryMediaInput, objectId, seoInput } from './common.js';

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    description: z.string().max(2000).optional(),
    image: cloudinaryMediaInput.nullable().optional(),
    parentCategoryId: objectId.nullable().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    sortOrder: z.number().int().optional(),
    seo: seoInput.pick({ metaTitle: true, metaDescription: true }).optional(),
  })
  .strict();

export const updateCategorySchema = createCategorySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' }
);

export const categoryStatusSchema = z
  .object({ status: z.enum(['active', 'inactive']) })
  .strict();

export const reorderCategoriesSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: objectId,
            sortOrder: z.number().int(),
          })
          .strict()
      )
      .min(1)
      .max(200),
  })
  .strict();

export const listCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  parentCategoryId: objectId.nullable().optional(),
});

export const categoryIdParamSchema = z.object({ id: objectId });
