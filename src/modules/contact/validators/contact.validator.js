import { z } from 'zod';
import {
  ENQUIRY_CATEGORIES,
  MESSAGE_VISIBILITY,
  SUPPORT_STATUS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
} from '../../../config/security.js';
import { objectId } from '../../courses/validators/common.js';

const statusEnum = z.enum(Object.values(SUPPORT_STATUS));

export const createEnquiryBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().max(30).optional().or(z.literal('')),
    subject: z.string().trim().min(3).max(200),
    message: z.string().trim().min(10).max(10000),
    category: z.enum(ENQUIRY_CATEGORIES).optional(),
  })
  .strict();

export const enquiryStatusBody = z.object({ status: statusEnum }).strict();

export const enquiryReplyBody = z
  .object({
    message: z.string().trim().min(1).max(5000),
    idempotencyKey: z.string().trim().min(8).max(120).optional(),
  })
  .strict();

export const enquiryNoteBody = z
  .object({
    message: z.string().trim().min(1).max(5000),
  })
  .strict();

export const adminEnquiryListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: statusEnum.optional(),
  category: z.enum(ENQUIRY_CATEGORIES).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sort: z.enum(['newest', 'last_activity']).default('newest'),
});

export const createTicketBody = z
  .object({
    category: z.enum(TICKET_CATEGORIES),
    subject: z.string().trim().min(3).max(200),
    description: z.string().trim().min(10).max(10000),
    priority: z.enum(TICKET_PRIORITIES).optional(),
  })
  .strict();

export const ticketReplyBody = z
  .object({
    message: z.string().trim().min(1).max(5000),
    attachments: z
      .array(
        z
          .object({
            mediaAssetId: objectId.optional().nullable(),
            fileName: z.string().trim().max(255).optional(),
            mimeType: z.string().trim().max(120).optional(),
            publicUrl: z.string().trim().max(2000).optional(),
          })
          .strict()
      )
      .max(5)
      .optional(),
    idempotencyKey: z.string().trim().min(8).max(120).optional(),
  })
  .strict();

export const ticketNoteBody = z
  .object({
    message: z.string().trim().min(1).max(5000),
  })
  .strict();

export const ticketStatusBody = z.object({ status: statusEnum }).strict();

export const ticketAssignBody = z
  .object({
    assignedTo: objectId.nullable(),
  })
  .strict();

export const studentTicketListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: statusEnum.optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(['newest', 'last_activity']).default('newest'),
});

export const adminTicketListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: statusEnum.optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  studentId: objectId.optional(),
  assignedTo: objectId.optional(),
  unassigned: z.coerce.boolean().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sort: z.enum(['newest', 'last_activity']).default('newest'),
});

export const idParam = z.object({ id: objectId });
