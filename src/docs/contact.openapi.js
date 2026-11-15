const bearer = [{ bearerAuth: [] }];

const SUPPORT_STATUSES = ['open', 'reviewed', 'resolved', 'closed'];
const ENQUIRY_CATEGORIES = ['general', 'courses', 'pricing', 'technical', 'partnership', 'other'];
const TICKET_CATEGORIES = ['account_login', 'course_learning', 'payment_fees', 'certificate', 'technical_issue', 'other'];
const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };

const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
];

const enquirySchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    referenceNumber: { type: 'string', example: 'ENQ-7F3K2Q9X' },
    name: { type: 'string' },
    email: { type: 'string', format: 'email' },
    phone: { type: 'string' },
    subject: { type: 'string' },
    message: { type: 'string' },
    category: { type: 'string', enum: ENQUIRY_CATEGORIES },
    status: { type: 'string', enum: SUPPORT_STATUSES },
    replies: { type: 'array', items: { type: 'object' } },
    internalNotes: { type: 'array', items: { type: 'object' }, description: 'Admin only' },
    statusHistory: { type: 'array', items: { type: 'object' } },
    lastActivityAt: { type: 'string', format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const ticketSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    ticketNumber: { type: 'string', example: 'TKT-7F3K2Q9X' },
    studentId: { type: 'string' },
    student: { type: 'object', description: 'Admin list/detail only' },
    category: { type: 'string', enum: TICKET_CATEGORIES },
    subject: { type: 'string' },
    description: { type: 'string' },
    priority: { type: 'string', enum: TICKET_PRIORITIES },
    status: { type: 'string', enum: SUPPORT_STATUSES },
    assignedTo: { type: 'string', nullable: true },
    assignee: { type: 'object', nullable: true, description: 'Admin only' },
    messages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          senderId: { type: 'string' },
          senderRole: { type: 'string', enum: ['student', 'admin', 'instructor'] },
          visibility: { type: 'string', enum: ['public', 'internal'], description: 'internal = staff-only note' },
          message: { type: 'string' },
          attachments: { type: 'array', items: { type: 'object' } },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    statusHistory: { type: 'array', items: { type: 'object' } },
    lastActivityAt: { type: 'string', format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const listResponse = (schema) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'array', items: schema },
    pagination: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        limit: { type: 'integer' },
        total: { type: 'integer' },
        totalPages: { type: 'integer' },
        hasNextPage: { type: 'boolean' },
        hasPreviousPage: { type: 'boolean' },
      },
    },
  },
});

const detailResponse = (schema) => ({
  type: 'object',
  properties: { success: { type: 'boolean' }, data: schema },
});

const statusBody = {
  required: true,
  content: {
    'application/json': {
      schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: SUPPORT_STATUSES } } },
    },
  },
};

export const contactOpenApiTags = [
  { name: 'Contact Enquiries' },
  { name: 'Admin Contact Enquiries' },
  { name: 'Student Support' },
  { name: 'Admin Support Tickets' },
];

export const contactOpenApiPaths = {
  '/contact-enquiries': {
    post: {
      tags: ['Contact Enquiries'],
      summary: 'Submit a public website enquiry (no auth, rate limited)',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'subject', 'message'],
              properties: {
                name: { type: 'string', minLength: 2, maxLength: 120 },
                email: { type: 'string', format: 'email' },
                phone: { type: 'string', maxLength: 30 },
                subject: { type: 'string', minLength: 3, maxLength: 200 },
                message: { type: 'string', minLength: 10, maxLength: 10000 },
                category: { type: 'string', enum: ENQUIRY_CATEGORIES },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Enquiry created', content: { 'application/json': { schema: detailResponse(enquirySchema) } } },
        400: { description: 'Validation error' },
        429: { description: 'Rate limited' },
      },
    },
  },
  '/admin/contact-enquiries': {
    get: {
      tags: ['Admin Contact Enquiries'],
      summary: 'List enquiries (search, status, category, date filters)',
      description: 'Requires admin or super_admin role.',
      security: bearer,
      parameters: [
        ...paginationParams,
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Matches reference, name, email, subject, message' },
        { name: 'status', in: 'query', schema: { type: 'string', enum: SUPPORT_STATUSES } },
        { name: 'category', in: 'query', schema: { type: 'string', enum: ENQUIRY_CATEGORIES } },
        { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'sort', in: 'query', schema: { type: 'string', enum: ['newest', 'last_activity'], default: 'newest' } },
      ],
      responses: {
        200: { description: 'Enquiries', content: { 'application/json': { schema: listResponse(enquirySchema) } } },
        401: { description: 'Unauthenticated' },
        403: { description: 'Not admin' },
      },
    },
  },
  '/admin/contact-enquiries/{id}': {
    get: {
      tags: ['Admin Contact Enquiries'],
      summary: 'Enquiry details incl. replies, internal notes, status history',
      security: bearer,
      parameters: [idParam],
      responses: {
        200: { description: 'Enquiry', content: { 'application/json': { schema: detailResponse(enquirySchema) } } },
        404: { description: 'Not found' },
      },
    },
  },
  '/admin/contact-enquiries/{id}/status': {
    patch: {
      tags: ['Admin Contact Enquiries'],
      summary: 'Change enquiry status (open/reviewed/resolved/closed, reopen allowed)',
      security: bearer,
      parameters: [idParam],
      requestBody: statusBody,
      responses: {
        200: { description: 'Updated enquiry' },
        400: { description: 'Invalid status' },
        404: { description: 'Not found' },
      },
    },
  },
  '/admin/contact-enquiries/{id}/replies': {
    post: {
      tags: ['Admin Contact Enquiries'],
      summary: 'Reply to the visitor (records history, queues notification email)',
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['message'],
              properties: {
                message: { type: 'string', minLength: 1, maxLength: 5000 },
                idempotencyKey: { type: 'string', minLength: 8, maxLength: 120 },
              },
            },
          },
        },
      },
      responses: { 201: { description: 'Reply recorded' }, 404: { description: 'Not found' } },
    },
  },
  '/admin/contact-enquiries/{id}/notes': {
    post: {
      tags: ['Admin Contact Enquiries'],
      summary: 'Add an internal note (never exposed publicly)',
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['message'], properties: { message: { type: 'string', minLength: 1, maxLength: 5000 } } },
          },
        },
      },
      responses: { 201: { description: 'Note recorded' }, 404: { description: 'Not found' } },
    },
  },
  '/admin/contact-enquiries/{id}/history': {
    get: {
      tags: ['Admin Contact Enquiries'],
      summary: 'Enquiry status/activity history',
      security: bearer,
      parameters: [idParam],
      responses: { 200: { description: 'History entries' }, 404: { description: 'Not found' } },
    },
  },
  '/support/tickets': {
    post: {
      tags: ['Student Support'],
      summary: 'Create a support ticket (authenticated; any role, ownership enforced)',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['category', 'subject', 'description'],
              properties: {
                category: { type: 'string', enum: TICKET_CATEGORIES },
                subject: { type: 'string', minLength: 3, maxLength: 200 },
                description: { type: 'string', minLength: 10, maxLength: 10000 },
                priority: { type: 'string', enum: TICKET_PRIORITIES },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Ticket created', content: { 'application/json': { schema: detailResponse(ticketSchema) } } },
        400: { description: 'Validation error' },
        401: { description: 'Unauthenticated' },
      },
    },
    get: {
      tags: ['Student Support'],
      summary: 'List own tickets',
      security: bearer,
      parameters: [
        ...paginationParams,
        { name: 'status', in: 'query', schema: { type: 'string', enum: SUPPORT_STATUSES } },
        { name: 'category', in: 'query', schema: { type: 'string', enum: TICKET_CATEGORIES } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'sort', in: 'query', schema: { type: 'string', enum: ['newest', 'last_activity'], default: 'newest' } },
      ],
      responses: { 200: { description: 'Own tickets', content: { 'application/json': { schema: listResponse(ticketSchema) } } } },
    },
  },
  '/support/tickets/{id}': {
    get: {
      tags: ['Student Support'],
      summary: 'Own ticket detail — public messages only, internal notes never exposed',
      security: bearer,
      parameters: [idParam],
      responses: {
        200: { description: 'Ticket', content: { 'application/json': { schema: detailResponse(ticketSchema) } } },
        403: { description: 'Not the owner' },
        404: { description: 'Not found' },
      },
    },
  },
  '/support/tickets/{id}/replies': {
    post: {
      tags: ['Student Support'],
      summary: 'Reply to own ticket (blocked when closed)',
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['message'],
              properties: {
                message: { type: 'string', minLength: 1, maxLength: 5000 },
                attachments: { type: 'array', maxItems: 5, items: { type: 'object' } },
                idempotencyKey: { type: 'string', minLength: 8, maxLength: 120 },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Reply recorded' },
        403: { description: 'Not the owner' },
        409: { description: 'Ticket closed' },
      },
    },
  },
  '/admin/support/tickets': {
    get: {
      tags: ['Admin Support Tickets'],
      summary: 'List all tickets (search, status, category, priority, student, assignee, date)',
      security: bearer,
      parameters: [
        ...paginationParams,
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Matches ticket number, subject, description, student name/email' },
        { name: 'status', in: 'query', schema: { type: 'string', enum: SUPPORT_STATUSES } },
        { name: 'category', in: 'query', schema: { type: 'string', enum: TICKET_CATEGORIES } },
        { name: 'priority', in: 'query', schema: { type: 'string', enum: TICKET_PRIORITIES } },
        { name: 'studentId', in: 'query', schema: { type: 'string' } },
        { name: 'assignedTo', in: 'query', schema: { type: 'string' } },
        { name: 'unassigned', in: 'query', schema: { type: 'boolean' } },
        { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'sort', in: 'query', schema: { type: 'string', enum: ['newest', 'last_activity'], default: 'newest' } },
      ],
      responses: {
        200: { description: 'Tickets', content: { 'application/json': { schema: listResponse(ticketSchema) } } },
        401: { description: 'Unauthenticated' },
        403: { description: 'Not admin' },
      },
    },
  },
  '/admin/support/tickets/{id}': {
    get: {
      tags: ['Admin Support Tickets'],
      summary: 'Ticket detail with full conversation incl. internal notes',
      security: bearer,
      parameters: [idParam],
      responses: { 200: { description: 'Ticket', content: { 'application/json': { schema: detailResponse(ticketSchema) } } }, 404: { description: 'Not found' } },
    },
  },
  '/admin/support/tickets/{id}/replies': {
    post: {
      tags: ['Admin Support Tickets'],
      summary: 'Public reply to the student (queues notification email)',
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['message'],
              properties: {
                message: { type: 'string', minLength: 1, maxLength: 5000 },
                attachments: { type: 'array', maxItems: 5, items: { type: 'object' } },
                idempotencyKey: { type: 'string', minLength: 8, maxLength: 120 },
              },
            },
          },
        },
      },
      responses: { 201: { description: 'Reply recorded' }, 404: { description: 'Not found' } },
    },
  },
  '/admin/support/tickets/{id}/notes': {
    post: {
      tags: ['Admin Support Tickets'],
      summary: 'Add an internal note (visibility=internal, hidden from student)',
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['message'], properties: { message: { type: 'string', minLength: 1, maxLength: 5000 } } },
          },
        },
      },
      responses: { 201: { description: 'Note recorded' }, 404: { description: 'Not found' } },
    },
  },
  '/admin/support/tickets/{id}/status': {
    patch: {
      tags: ['Admin Support Tickets'],
      summary: 'Change ticket status (reopen resolved/closed allowed, notifies student)',
      security: bearer,
      parameters: [idParam],
      requestBody: statusBody,
      responses: { 200: { description: 'Updated ticket' }, 400: { description: 'Invalid status' }, 404: { description: 'Not found' } },
    },
  },
  '/admin/support/tickets/{id}/assign': {
    patch: {
      tags: ['Admin Support Tickets'],
      summary: 'Assign ticket to a staff member (null unassigns)',
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { assignedTo: { type: 'string', nullable: true } } },
          },
        },
      },
      responses: { 200: { description: 'Updated ticket' }, 404: { description: 'Ticket or assignee not found' } },
    },
  },
  '/admin/support/tickets/{id}/history': {
    get: {
      tags: ['Admin Support Tickets'],
      summary: 'Ticket status/activity history',
      security: bearer,
      parameters: [idParam],
      responses: { 200: { description: 'History entries' }, 404: { description: 'Not found' } },
    },
  },
};
