const bearer = [{ bearerAuth: [] }];

export const instructorApplicationsOpenApiTags = [
  { name: 'Public Instructor Applications' },
  { name: 'Admin Instructor Applications' },
];

export const instructorApplicationsOpenApiPaths = {
  '/public/instructor-applications': {
    post: {
      tags: ['Public Instructor Applications'],
      summary: 'Submit become-an-instructor application with resume',
      description:
        'Public multipart form. Resume must be PDF/DOC/DOCX ≤5MB with valid file signature. Rate limited. Duplicate pending applications within 24h are rejected.',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: [
                'fullName',
                'phone',
                'email',
                'expertSubject',
                'expertiseLevel',
                'resume',
              ],
              properties: {
                fullName: { type: 'string' },
                phone: { type: 'string' },
                email: { type: 'string', format: 'email' },
                expertSubject: { type: 'string' },
                expertiseLevel: {
                  type: 'string',
                  enum: ['Expert', 'Proficient', 'Competent', 'Beginner'],
                },
                linkedinProfileUrl: { type: 'string' },
                comments: { type: 'string' },
                resume: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Application accepted (receipt only)' },
        400: { description: 'Validation / resume error' },
        409: { description: 'Duplicate recent application' },
      },
    },
  },
  '/admin/instructor-applications': {
    get: {
      tags: ['Admin Instructor Applications'],
      summary: 'List instructor applications',
      security: bearer,
      responses: { 200: { description: 'Paginated list' } },
    },
  },
  '/admin/instructor-applications/{id}': {
    get: {
      tags: ['Admin Instructor Applications'],
      summary: 'Get application details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Details' } },
    },
    delete: {
      tags: ['Admin Instructor Applications'],
      summary: 'Soft-delete application',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deleted' } },
    },
  },
  '/admin/instructor-applications/{id}/status': {
    patch: {
      tags: ['Admin Instructor Applications'],
      summary: 'Update application status',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/admin/instructor-applications/{id}/resume': {
    get: {
      tags: ['Admin Instructor Applications'],
      summary: 'Secure resume download (admin only, no public URL)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'File stream' } },
    },
  },
};
