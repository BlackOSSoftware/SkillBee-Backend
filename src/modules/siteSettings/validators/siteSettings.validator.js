import { z } from 'zod';

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !v || /^https?:\/\//i.test(v), 'Must be http(s) URL')
  .optional()
  .or(z.literal(''));

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Invalid email')
  .optional()
  .or(z.literal(''));

const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .refine((v) => !v || /^[+]?[\d\s\-()]{7,20}$/.test(v), 'Invalid phone')
  .optional()
  .or(z.literal(''));

/** Indian GSTIN: 15 chars — 2 digit state + 10 PAN + entity + Z + check */
const optionalGstin = z
  .string()
  .trim()
  .toUpperCase()
  .max(15)
  .refine(
    (v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v),
    'Invalid GSTIN'
  )
  .optional()
  .or(z.literal(''));

export const siteSettingsPatchBody = z
  .object({
    contact: z
      .object({
        companyName: z.string().trim().max(200).optional(),
        email: optionalEmail,
        phone: optionalPhone,
        alternatePhone: optionalPhone,
        whatsappNumber: optionalPhone,
        address: z.string().trim().max(500).optional(),
        city: z.string().trim().max(120).optional(),
        state: z.string().trim().max(120).optional(),
        country: z.string().trim().max(120).optional(),
        postalCode: z.string().trim().max(20).optional(),
        gstin: optionalGstin,
        businessHours: z.string().trim().max(500).optional(),
      })
      .strict()
      .optional(),
    socialLinks: z
      .object({
        facebook: optionalUrl,
        instagram: optionalUrl,
        linkedin: optionalUrl,
        youtube: optionalUrl,
        twitter: optionalUrl,
        telegram: optionalUrl,
        whatsapp: optionalUrl,
      })
      .strict()
      .optional(),
  })
  .strict();
