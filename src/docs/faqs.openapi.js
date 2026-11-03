const bearer = [{ bearerAuth: [] }];

export const faqsOpenApiTags = [
  { name: 'Public FAQs' },
  { name: 'Admin FAQs' },
];

export const faqsOpenApiPaths = {
  '/public/faqs': {
    get: {
      tags: ['Public FAQs'],
      summary: 'Published FAQs with optional FAQPage schema',
      description: 'Draft FAQs never appear. Redis-cached. Ordered by displayOrder.',
      responses: { 200: { description: 'Published FAQs + schema' } },
    },
  },
  '/public/faqs/{id}': {
    get: {
      tags: ['Public FAQs'],
      summary: 'One published FAQ',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'FAQ' }, 404: { description: 'Not found / draft' } },
    },
  },
  '/public/courses/{courseId}/faqs': {
    get: {
      tags: ['Public FAQs'],
      summary: 'Course-specific published FAQs',
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: { 200: { description: 'FAQs' } },
    },
  },
  '/admin/faqs': {
    get: {
      tags: ['Admin FAQs'],
      summary: 'List FAQs',
      security: bearer,
      responses: { 200: { description: 'Paginated list' } },
    },
    post: {
      tags: ['Admin FAQs'],
      summary: 'Create FAQ (draft)',
      security: bearer,
      responses: { 201: { description: 'Created' } },
    },
  },
  '/admin/faqs/reorder': {
    patch: {
      tags: ['Admin FAQs'],
      summary: 'Reorder FAQs by orderedIds',
      security: bearer,
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/admin/faqs/{id}': {
    get: {
      tags: ['Admin FAQs'],
      summary: 'FAQ details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Details' } },
    },
    patch: {
      tags: ['Admin FAQs'],
      summary: 'Edit FAQ',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
    delete: {
      tags: ['Admin FAQs'],
      summary: 'Delete FAQ',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deleted' } },
    },
  },
  '/admin/faqs/{id}/status': {
    patch: {
      tags: ['Admin FAQs'],
      summary: 'Publish or unpublish FAQ',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
};
