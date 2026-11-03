const bearer = [{ bearerAuth: [] }];

export const qaOpenApiTags = [
  { name: 'Student Q&A' },
  { name: 'Admin Q&A' },
];

export const qaOpenApiPaths = {
  '/student/courses/{id}/questions': {
    post: {
      tags: ['Student Q&A'],
      summary: 'Ask a course question',
      description: 'Requires authenticated student with active enrollment.',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        201: { description: 'Question created' },
        403: { description: 'Not enrolled' },
      },
    },
  },
  '/student/questions': {
    get: {
      tags: ['Student Q&A'],
      summary: 'List own questions',
      security: bearer,
      responses: { 200: { description: 'Questions' } },
    },
  },
  '/student/questions/{id}': {
    get: {
      tags: ['Student Q&A'],
      summary: 'Get own question with replies',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Question' }, 403: { description: 'Not owner' } },
    },
  },
  '/student/questions/{id}/replies': {
    post: {
      tags: ['Student Q&A'],
      summary: 'Reply to own open question',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 201: { description: 'Reply created' }, 409: { description: 'Resolved' } },
    },
  },
  '/admin/questions-answers': {
    get: {
      tags: ['Admin Q&A'],
      summary: 'List all questions (filters: answered, status, course, search)',
      security: bearer,
      responses: { 200: { description: 'Questions' } },
    },
  },
  '/admin/questions-answers/{id}': {
    get: {
      tags: ['Admin Q&A'],
      summary: 'Question details with replies',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Question' } },
    },
    delete: {
      tags: ['Admin Q&A'],
      summary: 'Soft-delete question and replies',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deleted' } },
    },
  },
  '/admin/questions-answers/{id}/replies': {
    post: {
      tags: ['Admin Q&A'],
      summary: 'Admin/instructor reply',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 201: { description: 'Reply created' } },
    },
  },
  '/admin/questions-answers/{id}/status': {
    patch: {
      tags: ['Admin Q&A'],
      summary: 'Resolve or reopen question',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
};
