const bearer = [{ bearerAuth: [] }];

export const certificatesOpenApiTags = [
  { name: 'Admin Certificate Templates' },
  { name: 'Admin Certificates' },
  { name: 'Student Certificates' },
  { name: 'Public Certificate Verification' },
];

export const certificatesOpenApiPaths = {
  '/admin/certificate-templates': {
    get: {
      tags: ['Admin Certificate Templates'],
      summary: 'List certificate templates',
      security: bearer,
      responses: { 200: { description: 'Templates' } },
    },
    post: {
      tags: ['Admin Certificate Templates'],
      summary: 'Create certificate template',
      security: bearer,
      responses: { 201: { description: 'Created' } },
    },
  },
  '/admin/certificate-templates/{id}': {
    get: {
      tags: ['Admin Certificate Templates'],
      summary: 'Template details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Template' } },
    },
    patch: {
      tags: ['Admin Certificate Templates'],
      summary: 'Update template (does not alter issued certificates)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
    delete: {
      tags: ['Admin Certificate Templates'],
      summary: 'Soft-delete unused template',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deleted' }, 409: { description: 'Template in use' } },
    },
  },
  '/admin/certificate-templates/{id}/status': {
    patch: {
      tags: ['Admin Certificate Templates'],
      summary: 'Activate/deactivate template',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/admin/certificate-templates/{id}/default': {
    patch: {
      tags: ['Admin Certificate Templates'],
      summary: 'Set default template',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/admin/certificate-templates/{id}/duplicate': {
    post: {
      tags: ['Admin Certificate Templates'],
      summary: 'Duplicate template',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 201: { description: 'Duplicated' } },
    },
  },
  '/admin/certificates': {
    get: {
      tags: ['Admin Certificates'],
      summary: 'List issued certificates',
      security: bearer,
      responses: { 200: { description: 'Certificates' } },
    },
  },
  '/admin/certificates/issue': {
    post: {
      tags: ['Admin Certificates'],
      summary: 'Issue certificate after backend eligibility check',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['studentId', 'courseId'],
              properties: {
                studentId: { type: 'string' },
                courseId: { type: 'string' },
                templateId: { type: 'string' },
                reason: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Issued' },
        400: { description: 'Not eligible' },
        409: { description: 'Duplicate active certificate' },
      },
    },
  },
  '/admin/certificates/{id}': {
    get: {
      tags: ['Admin Certificates'],
      summary: 'Certificate details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Certificate' } },
    },
  },
  '/admin/certificates/{id}/revoke': {
    post: {
      tags: ['Admin Certificates'],
      summary: 'Revoke certificate',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Revoked' } },
    },
  },
  '/admin/certificates/{id}/regenerate': {
    post: {
      tags: ['Admin Certificates'],
      summary: 'Regenerate PDF from stored snapshot',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Regenerated' } },
    },
  },
  '/admin/certificates/{id}/history': {
    get: {
      tags: ['Admin Certificates'],
      summary: 'Certificate history',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'History' } },
    },
  },
  '/admin/certificates/{id}/download': {
    get: {
      tags: ['Admin Certificates'],
      summary: 'Download certificate PDF',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'PDF binary' } },
    },
  },
  '/admin/students/{studentId}/certificate-eligibility/{courseId}': {
    get: {
      tags: ['Admin Certificates'],
      summary: 'Check certificate eligibility',
      security: bearer,
      parameters: [
        { name: 'studentId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: { 200: { description: 'Eligibility details' } },
    },
  },
  '/student/certificates': {
    get: {
      tags: ['Student Certificates'],
      summary: 'List my certificates',
      security: bearer,
      responses: { 200: { description: 'Certificates' } },
    },
  },
  '/student/certificates/{id}': {
    get: {
      tags: ['Student Certificates'],
      summary: 'My certificate details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Certificate' }, 404: { description: 'Not found' } },
    },
  },
  '/student/certificates/{id}/download': {
    get: {
      tags: ['Student Certificates'],
      summary: 'Download my certificate PDF',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'PDF binary' } },
    },
  },
  '/certificates/verify/{code}': {
    get: {
      tags: ['Public Certificate Verification'],
      summary: 'Public verification (no auth)',
      parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'valid / revoked / expired' },
        404: { description: 'not_found' },
      },
    },
  },
};
