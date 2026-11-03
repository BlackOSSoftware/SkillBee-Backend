const bearer = [{ bearerAuth: [] }];

export const newsletterOpenApiTags = [
  { name: 'Public Newsletter' },
  { name: 'Admin Newsletter' },
];

export const newsletterOpenApiPaths = {
  '/public/newsletter/subscribe': {
    post: {
      tags: ['Public Newsletter'],
      summary: 'Subscribe (double opt-in)',
      description:
        'Normalizes email. Always returns a generic message. Verification email queued via Phase 15. Tokens hashed at rest.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: { email: { type: 'string', format: 'email' } },
            },
          },
        },
      },
      responses: { 201: { description: 'Generic acknowledgement' } },
    },
  },
  '/public/newsletter/verify': {
    get: {
      tags: ['Public Newsletter'],
      summary: 'Verify subscription token',
      parameters: [
        { name: 'email', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'token', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: { description: 'Verified' },
        400: { description: 'Invalid or expired token' },
      },
    },
  },
  '/public/newsletter/unsubscribe': {
    post: {
      tags: ['Public Newsletter'],
      summary: 'Unsubscribe with HMAC or stored token',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'token'],
              properties: {
                email: { type: 'string' },
                token: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Generic acknowledgement' } },
    },
  },
  '/admin/newsletter/subscribers': {
    get: {
      tags: ['Admin Newsletter'],
      summary: 'List subscribers',
      security: bearer,
      responses: { 200: { description: 'Paginated list' } },
    },
  },
  '/admin/newsletter/subscribers/{id}': {
    get: {
      tags: ['Admin Newsletter'],
      summary: 'Subscriber details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Details' } },
    },
    delete: {
      tags: ['Admin Newsletter'],
      summary: 'Delete subscriber',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deleted' } },
    },
  },
  '/admin/newsletter/subscribers/{id}/status': {
    patch: {
      tags: ['Admin Newsletter'],
      summary: 'Change subscriber status',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/admin/newsletter/campaigns': {
    get: {
      tags: ['Admin Newsletter'],
      summary: 'Campaign history',
      security: bearer,
      responses: { 200: { description: 'Paginated list' } },
    },
    post: {
      tags: ['Admin Newsletter'],
      summary: 'Create and queue campaign to verified subscribers',
      description:
        'Sends via email queue with unsubscribe links. Skips unverified/unsubscribed. Prevents duplicate delivery per campaign.',
      security: bearer,
      responses: { 201: { description: 'Campaign queued' } },
    },
  },
  '/admin/newsletter/campaigns/{id}': {
    get: {
      tags: ['Admin Newsletter'],
      summary: 'Campaign details and stats',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Details' } },
    },
  },
};
