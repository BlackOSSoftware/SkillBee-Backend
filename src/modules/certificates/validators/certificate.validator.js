import { z } from 'zod';
import { CERTIFICATE_STATUSES } from '../../../models/Certificate.js';
import { CERTIFICATE_TEMPLATE_STATUSES } from '../../../models/CertificateTemplate.js';

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId');

const mediaRef = z
  .object({
    storageKey: z.string().max(500).nullable().optional(),
    mediaAssetId: objectId.nullable().optional(),
    url: z.string().url().nullable().optional(),
    originalFileName: z.string().max(255).nullable().optional(),
  })
  .strict()
  .optional();

export const createTemplateBody = z
  .object({
    name: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).optional(),
    templateCode: z.string().trim().min(2).max(80).optional(),
    backgroundImage: mediaRef,
    organizationName: z.string().trim().max(200).optional(),
    organizationLogo: mediaRef,
    signatureImage: mediaRef,
    authorizedSignatoryName: z.string().trim().max(200).optional(),
    authorizedSignatoryDesignation: z.string().trim().max(200).optional(),
    certificateTitle: z.string().trim().max(200).optional(),
    certificateDescription: z.string().trim().max(2000).optional(),
    fieldConfiguration: z.record(z.unknown()).optional(),
    layoutConfiguration: z.record(z.unknown()).optional(),
    status: z.enum(CERTIFICATE_TEMPLATE_STATUSES).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const updateTemplateBody = createTemplateBody.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'At least one field required' }
);

export const templateStatusBody = z
  .object({ status: z.enum(CERTIFICATE_TEMPLATE_STATUSES) })
  .strict();

export const templateIdParams = z.object({ id: objectId });

export const templateListQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(CERTIFICATE_TEMPLATE_STATUSES).optional(),
  search: z.string().trim().max(200).optional(),
});

export const issueCertificateBody = z
  .object({
    studentId: objectId,
    courseId: objectId,
    templateId: objectId.optional(),
    reason: z.string().trim().max(2000).optional(),
    replaceRevokedId: objectId.optional(),
  })
  .strict();

export const revokeBody = z
  .object({
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();

export const certificateIdParams = z.object({ id: objectId });

export const certificateListQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  studentId: objectId.optional(),
  courseId: objectId.optional(),
  status: z.enum(CERTIFICATE_STATUSES).optional(),
});

export const eligibilityParams = z.object({
  studentId: objectId,
  courseId: objectId,
});

export const verifyCodeParams = z.object({
  code: z.string().trim().min(16).max(128),
});
