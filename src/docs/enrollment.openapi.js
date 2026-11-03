const bearer = [{ bearerAuth: [] }];

export const enrollmentOpenApiTags = [
  { name: 'Admin Enrollments' },
  { name: 'Student Enrollment & Progress' },
];

export const enrollmentOpenApiPaths = {
  '/admin/enrollments': {
    get: {
      tags: ['Admin Enrollments'],
      summary: 'List enrollments',
      security: bearer,
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'courseId', in: 'query', schema: { type: 'string' } },
        { name: 'studentId', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string' } },
        { name: 'enrollmentType', in: 'query', schema: { type: 'string' } },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Student name/email' },
        { name: 'progressMin', in: 'query', schema: { type: 'number' } },
        { name: 'progressMax', in: 'query', schema: { type: 'number' } },
      ],
      responses: { 200: { description: 'Enrollment list' } },
    },
    post: {
      tags: ['Admin Enrollments'],
      summary: 'Create manual enrollment',
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
                enrollmentType: {
                  type: 'string',
                  enum: ['purchase', 'manual', 'free', 'admin_granted', 'migration'],
                },
                status: { type: 'string', enum: ['active', 'pending'] },
                enrollmentExpiresAt: { type: 'string', format: 'date-time', nullable: true },
                reason: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Created' },
        409: { description: 'Duplicate active enrollment' },
      },
    },
  },
  '/admin/enrollments/{id}': {
    get: {
      tags: ['Admin Enrollments'],
      summary: 'Enrollment details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Enrollment' } },
    },
    patch: {
      tags: ['Admin Enrollments'],
      summary: 'Update enrollment',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
    delete: {
      tags: ['Admin Enrollments'],
      summary: 'Revoke enrollment',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Revoked — progress history preserved' } },
    },
  },
  '/admin/enrollments/{id}/status': {
    patch: {
      tags: ['Admin Enrollments'],
      summary: 'Update enrollment status',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Status updated' } },
    },
  },
  '/admin/enrollments/{id}/history': {
    get: {
      tags: ['Admin Enrollments'],
      summary: 'Enrollment history events',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'History' } },
    },
  },
  '/admin/enrollments/{id}/progress': {
    get: {
      tags: ['Admin Enrollments'],
      summary: 'Enrollment progress detail',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Progress' } },
    },
  },
  '/admin/courses/{courseId}/enrollments': {
    get: {
      tags: ['Admin Enrollments'],
      summary: 'Course-wise enrollments',
      security: bearer,
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Enrollments' } },
    },
  },
  '/admin/students/{studentId}/enrollments': {
    get: {
      tags: ['Admin Enrollments'],
      summary: 'Student enrollment history',
      security: bearer,
      parameters: [{ name: 'studentId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Enrollments' } },
    },
  },
  '/student/my-courses': {
    get: {
      tags: ['Student Enrollment & Progress'],
      summary: 'List my enrolled courses',
      security: bearer,
      parameters: [
        {
          name: 'filter',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['all', 'active', 'in_progress', 'completed', 'pending', 'not_started', 'expired'],
          },
        },
      ],
      responses: { 200: { description: 'Courses with progress' } },
    },
  },
  '/student/courses/{id}/progress': {
    get: {
      tags: ['Student Enrollment & Progress'],
      summary: 'Course progress for authenticated student',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Progress' }, 403: { description: 'Not enrolled' } },
    },
  },
  '/student/dashboard': {
    get: {
      tags: ['Student Enrollment & Progress'],
      summary: 'Student dashboard aggregates',
      security: bearer,
      responses: { 200: { description: 'Dashboard summary' } },
    },
  },
  '/student/lessons/{id}/complete': {
    post: {
      tags: ['Student Enrollment & Progress'],
      summary: 'Mark lesson complete (server-validated)',
      description:
        'Progress percentage is calculated on the backend. Client-supplied progress fields are rejected. Video playback verification is not yet server-tracked — see docs/progress-calculation.md.',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                watchDurationSeconds: {
                  type: 'integer',
                  description: 'Informational only — not used as completion proof',
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Updated progress' },
        400: { description: 'Completion rules not met' },
        403: { description: 'Not enrolled / expired / revoked' },
      },
    },
  },
};
