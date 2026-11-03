export const assignmentsOpenApiTags = [
  { name: 'Admin Assignments' },
  { name: 'Admin Submissions' },
  { name: 'Student Assignments' },
];

const bearer = [{ bearerAuth: [] }];
const err = {
  400: { description: 'Validation error' },
  401: { description: 'Unauthorized' },
  403: { description: 'Forbidden' },
  404: { description: 'Not found' },
  409: { description: 'Conflict' },
  413: { description: 'File too large' },
  415: { description: 'Unsupported media type' },
  422: { description: 'Unprocessable' },
};

export const assignmentsOpenApiPaths = {
  '/admin/assignments': {
    get: {
      tags: ['Admin Assignments'],
      summary: 'List assignments',
      security: bearer,
      description: 'RBAC: assignments.read. Filters: search, courseId, lessonId, status, due dates, pagination.',
      responses: { 200: { description: 'Assignment list' }, ...err },
    },
    post: {
      tags: ['Admin Assignments'],
      summary: 'Create assignment',
      security: bearer,
      description: 'RBAC: assignments.create. submissionType: file_upload | text | file_and_text',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'instructions', 'courseId', 'maximumMarks', 'submissionType'],
              properties: {
                title: { type: 'string' },
                instructions: { type: 'string' },
                courseId: { type: 'string' },
                lessonId: { type: 'string', nullable: true },
                dueDate: { type: 'string', format: 'date-time' },
                maximumMarks: { type: 'number' },
                submissionType: {
                  type: 'string',
                  enum: ['file_upload', 'text', 'file_and_text'],
                },
                allowedFileTypes: { type: 'array', items: { type: 'string' } },
                maximumFileSizeBytes: { type: 'integer' },
                allowLateSubmission: { type: 'boolean' },
                allowResubmission: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { 201: { description: 'Created' }, ...err },
    },
  },
  '/admin/assignments/{id}': {
    get: {
      tags: ['Admin Assignments'],
      summary: 'Get assignment',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Assignment' }, ...err },
    },
    patch: {
      tags: ['Admin Assignments'],
      summary: 'Update assignment (preserves historical submissions)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' }, ...err },
    },
    delete: {
      tags: ['Admin Assignments'],
      summary: 'Soft-delete / archive assignment',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Soft-deleted' }, ...err },
    },
  },
  '/admin/assignments/{id}/status': {
    patch: {
      tags: ['Admin Assignments'],
      summary: 'Publish, close, or archive',
      security: bearer,
      description: 'RBAC: assignments.publish',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: {
                  type: 'string',
                  enum: ['draft', 'published', 'closed', 'archived'],
                },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Status changed' }, ...err },
    },
  },
  '/admin/assignments/{id}/submissions': {
    get: {
      tags: ['Admin Submissions'],
      summary: 'List submissions for an assignment',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Submissions' }, ...err },
    },
  },
  '/admin/submissions/{id}': {
    get: {
      tags: ['Admin Submissions'],
      summary: 'Submission details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Submission' }, ...err },
    },
  },
  '/admin/submissions/{id}/grade': {
    patch: {
      tags: ['Admin Submissions'],
      summary: 'Grade submission',
      security: bearer,
      description: 'RBAC: assignments.grade. Marks cannot be negative or exceed maximumMarks.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['marksAwarded'],
              properties: {
                marksAwarded: { type: 'number' },
                feedback: { type: 'string' },
                status: { type: 'string', enum: ['evaluated', 'returned'] },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Graded' }, ...err },
    },
  },
  '/admin/submissions/{id}/return': {
    patch: {
      tags: ['Admin Submissions'],
      summary: 'Return submission for correction',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Returned' }, ...err },
    },
  },
  '/admin/submissions/{id}/history': {
    get: {
      tags: ['Admin Submissions'],
      summary: 'Submission and evaluation history',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'History' }, ...err },
    },
  },
  '/student/assignments': {
    get: {
      tags: ['Student Assignments'],
      summary: 'List available published assignments for enrolled courses',
      security: bearer,
      responses: { 200: { description: 'Assignments' }, ...err },
    },
  },
  '/student/assignments/my-submissions': {
    get: {
      tags: ['Student Assignments'],
      summary: 'Own submission history',
      security: bearer,
      responses: { 200: { description: 'Submissions' }, ...err },
    },
  },
  '/student/assignments/{id}': {
    get: {
      tags: ['Student Assignments'],
      summary: 'Published assignment details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Assignment' }, ...err },
    },
  },
  '/student/assignments/{id}/submit': {
    post: {
      tags: ['Student Assignments'],
      summary: 'Submit assignment (multipart: textContent + files[])',
      security: bearer,
      description:
        'Enrollment required. File signature validated. Stored under UPLOAD_ROOT/assignments/. Student cannot send marks/status.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                textContent: { type: 'string' },
                files: { type: 'array', items: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
      },
      responses: { 201: { description: 'Submitted' }, ...err },
    },
  },
  '/student/submissions/{id}': {
    get: {
      tags: ['Student Assignments'],
      summary: 'Own submission details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Submission' }, ...err },
    },
  },
  '/student/submissions/{id}/feedback': {
    get: {
      tags: ['Student Assignments'],
      summary: 'View evaluation feedback',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Feedback' }, ...err },
    },
  },
};
