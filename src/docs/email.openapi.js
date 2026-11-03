const bearer = [{ bearerAuth: [] }];

export const emailOpenApiTags = [
  { name: 'Email Templates' },
  { name: 'Email Logs' },
];

export const emailOpenApiPaths = {
  '/admin/email-templates': {
    get: {
      tags: ['Email Templates'],
      summary: 'List email templates',
      security: bearer,
      responses: { 200: { description: 'Templates' } },
    },
    post: {
      tags: ['Email Templates'],
      summary: 'Create email template',
      security: bearer,
      responses: { 201: { description: 'Created' } },
    },
  },
  '/admin/email-templates/{id}': {
    get: {
      tags: ['Email Templates'],
      summary: 'Get template',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Template' } },
    },
    patch: {
      tags: ['Email Templates'],
      summary: 'Update template',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/admin/email-templates/{id}/status': {
    patch: {
      tags: ['Email Templates'],
      summary: 'Activate/deactivate template',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/admin/email-logs': {
    get: {
      tags: ['Email Logs'],
      summary: 'Email delivery logs',
      security: bearer,
      responses: { 200: { description: 'Logs' } },
    },
  },
  '/admin/email-logs/{id}': {
    get: {
      tags: ['Email Logs'],
      summary: 'Email log details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Log' } },
    },
  },
};
