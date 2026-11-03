const bearer = [{ bearerAuth: [] }];

export const blogsOpenApiTags = [
  { name: 'Public Blogs' },
  { name: 'Admin Blogs' },
];

export const blogsOpenApiPaths = {
  '/public/blogs': {
    get: {
      tags: ['Public Blogs'],
      summary: 'Published blog listing',
      responses: { 200: { description: 'Paginated published blogs' } },
    },
  },
  '/public/blogs/featured': {
    get: {
      tags: ['Public Blogs'],
      summary: 'Featured published blogs',
      responses: { 200: { description: 'Featured blogs' } },
    },
  },
  '/public/blogs/{slug}': {
    get: {
      tags: ['Public Blogs'],
      summary: 'Published blog by slug (includes SEO fields)',
      parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Blog + SEO' },
        404: { description: 'Draft/archived/missing' },
      },
    },
  },
  '/public/blog-categories': {
    get: {
      tags: ['Public Blogs'],
      summary: 'Published blog categories',
      responses: { 200: { description: 'Categories' } },
    },
  },
  '/public/blog-categories/{slug}/blogs': {
    get: {
      tags: ['Public Blogs'],
      summary: 'Blogs in category',
      parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Blogs' } },
    },
  },
  '/public/blog-tags/{tag}/blogs': {
    get: {
      tags: ['Public Blogs'],
      summary: 'Blogs by tag',
      parameters: [{ name: 'tag', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Blogs' } },
    },
  },
  '/admin/blogs': {
    get: {
      tags: ['Admin Blogs'],
      summary: 'List blogs',
      security: bearer,
      responses: { 200: { description: 'Paginated list' } },
    },
    post: {
      tags: ['Admin Blogs'],
      summary: 'Create draft blog',
      security: bearer,
      responses: { 201: { description: 'Created' } },
    },
  },
  '/admin/blogs/categories': {
    post: {
      tags: ['Admin Blogs'],
      summary: 'Create blog category',
      security: bearer,
      responses: { 201: { description: 'Created' } },
    },
  },
  '/admin/blogs/{id}': {
    get: {
      tags: ['Admin Blogs'],
      summary: 'Blog details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Details' } },
    },
    patch: {
      tags: ['Admin Blogs'],
      summary: 'Edit blog (slug change creates 301 redirect when published)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
    delete: {
      tags: ['Admin Blogs'],
      summary: 'Archive/delete blog',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deleted' } },
    },
  },
  '/admin/blogs/{id}/status': {
    patch: {
      tags: ['Admin Blogs'],
      summary: 'Publish / unpublish / archive',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/admin/blogs/{id}/seo': {
    get: {
      tags: ['Admin Blogs'],
      summary: 'Get blog SEO (Phase 13 integration)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'SEO fields + canonical' } },
    },
    patch: {
      tags: ['Admin Blogs'],
      summary: 'Update blog SEO; invalidates sitemap/resolve caches',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/admin/blogs/{id}/preview': {
    post: {
      tags: ['Admin Blogs'],
      summary: 'Generate private preview token (not indexable)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 201: { description: 'Preview token' } },
    },
  },
};
