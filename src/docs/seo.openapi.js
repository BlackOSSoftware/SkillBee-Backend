const bearer = [{ bearerAuth: [] }];

export const seoOpenApiTags = [
  { name: 'Admin SEO' },
  { name: 'Public SEO' },
];

export const seoOpenApiPaths = {
  '/admin/seo/settings': {
    get: {
      tags: ['Admin SEO'],
      summary: 'Get global SEO settings',
      security: bearer,
      responses: { 200: { description: 'Settings' } },
    },
    patch: {
      tags: ['Admin SEO'],
      summary: 'Update global SEO settings',
      security: bearer,
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/admin/seo/pages/{id}': {
    get: {
      tags: ['Admin SEO'],
      summary: 'Get page SEO by id or pageIdentifier',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Page SEO' } },
    },
    patch: {
      tags: ['Admin SEO'],
      summary: 'Update page SEO',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/admin/seo/courses/{id}': {
    get: {
      tags: ['Admin SEO'],
      summary: 'Get course SEO',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Course SEO' } },
    },
    patch: {
      tags: ['Admin SEO'],
      summary: 'Update course SEO (slug change creates 301 for published courses)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/admin/seo/redirects': {
    get: {
      tags: ['Admin SEO'],
      summary: 'List redirects',
      security: bearer,
      responses: { 200: { description: 'Redirects' } },
    },
    post: {
      tags: ['Admin SEO'],
      summary: 'Create redirect',
      security: bearer,
      responses: { 201: { description: 'Created' } },
    },
  },
  '/admin/seo/redirects/{id}': {
    patch: {
      tags: ['Admin SEO'],
      summary: 'Update redirect',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
    delete: {
      tags: ['Admin SEO'],
      summary: 'Deactivate/delete redirect',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deleted' } },
    },
  },
  '/seo/resolve': {
    get: {
      tags: ['Public SEO'],
      summary: 'Resolve SEO metadata for a public path (SSR)',
      description:
        'Returns title, description, canonical, robots, Open Graph, Twitter, JSON-LD. ' +
        'If an active redirect exists, returns type=redirect with status+location. ' +
        'Draft/unpublished courses return 404.',
      parameters: [
        {
          name: 'path',
          in: 'query',
          required: true,
          schema: { type: 'string', example: '/courses/example-course' },
        },
      ],
      responses: {
        200: { description: 'Metadata payload' },
        404: { description: 'Unknown path' },
      },
    },
  },
  '/seo/http-redirect': {
    get: {
      tags: ['Public SEO'],
      summary: 'Issue real HTTP 301/302 for a path',
      parameters: [
        { name: 'path', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: {
        301: { description: 'Permanent redirect' },
        302: { description: 'Temporary redirect' },
        404: { description: 'No redirect' },
      },
    },
  },
};
