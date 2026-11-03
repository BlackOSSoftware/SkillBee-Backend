const idParam = (name) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
});

export const curriculumOpenApiPaths = {
  '/admin/courses/{courseId}/topics': {
    get: {
      tags: ['Curriculum'],
      summary: 'List topics for a course',
      security: [{ bearerAuth: [] }],
      description: 'Permissions: courses.curriculum.read | instructor.curriculum.manage',
      parameters: [
        idParam('courseId'),
        { name: 'status', in: 'query', schema: { type: 'string' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'includeLessons', in: 'query', schema: { type: 'boolean' } },
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
      ],
      responses: { 200: { description: 'Topic list' }, 401: { description: 'Unauthorized' }, 403: { description: 'Forbidden' } },
    },
    post: {
      tags: ['Curriculum'],
      summary: 'Create topic / chapter',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('courseId')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            example: {
              title: 'Introduction to Computerized System Validation',
              description: 'Fundamental concepts of CSV and regulated computerized systems.',
              availabilityType: 'immediate',
              status: 'draft',
              isRequired: true,
            },
          },
        },
      },
      responses: { 201: { description: 'Created' }, 400: { description: 'Validation error' }, 422: { description: 'Course archived' } },
    },
  },
  '/admin/courses/{courseId}/topics/reorder': {
    patch: {
      tags: ['Curriculum'],
      summary: 'Reorder all active topics atomically',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('courseId')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            example: { topicIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'] },
          },
        },
      },
      responses: {
        200: { description: 'Ordered topics' },
        400: { description: 'Duplicate/incomplete/cross-course IDs' },
      },
    },
  },
  '/admin/topics/{id}': {
    get: {
      tags: ['Curriculum'],
      summary: 'Topic details',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      responses: { 200: { description: 'Topic' }, 404: { description: 'Not found' } },
    },
    patch: {
      tags: ['Curriculum'],
      summary: 'Update topic',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      responses: { 200: { description: 'Updated' } },
    },
    delete: {
      tags: ['Curriculum'],
      summary: 'Archive topic (soft-delete; archives child lessons)',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      responses: { 200: { description: 'Archived' } },
    },
  },
  '/admin/topics/{id}/duplicate': {
    post: {
      tags: ['Curriculum'],
      summary: 'Duplicate topic and lessons as draft',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      responses: { 201: { description: 'Duplicated' } },
    },
  },
  '/admin/topics/{id}/status': {
    patch: {
      tags: ['Curriculum'],
      summary: 'Publish / unpublish / archive topic',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      requestBody: {
        content: {
          'application/json': { example: { status: 'published' } },
        },
      },
      responses: { 200: { description: 'Status updated' } },
    },
  },
  '/admin/topics/{topicId}/lessons': {
    get: {
      tags: ['Lessons'],
      summary: 'List lessons in a topic',
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam('topicId'),
        { name: 'type', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'isPreview', in: 'query', schema: { type: 'boolean' } },
      ],
      responses: { 200: { description: 'Lessons' } },
    },
    post: {
      tags: ['Lessons'],
      summary: 'Create lesson (video/text/live/resource)',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('topicId')],
      requestBody: {
        content: {
          'application/json': {
            examples: {
              video: {
                value: {
                  title: 'Understanding GAMP 5 Principles',
                  type: 'video',
                  durationSeconds: 1800,
                  status: 'draft',
                },
              },
              text: {
                value: {
                  title: 'CSV Documentation Fundamentals',
                  type: 'text',
                  textContent: {
                    body: '<h2>CSV Documentation</h2><p>Introduction.</p>',
                    format: 'html',
                  },
                },
              },
              live: {
                value: {
                  title: 'Live CSV Q&A',
                  type: 'live',
                  liveSession: {
                    meetingProvider: 'Google Meet',
                    meetingUrl: 'https://meet.google.com/example-placeholder',
                    startsAt: '2026-11-10T10:00:00Z',
                    endsAt: '2026-11-10T11:00:00Z',
                    timezone: 'Asia/Kolkata',
                  },
                },
              },
            },
          },
        },
      },
      responses: { 201: { description: 'Created as draft unless validated publish path used later' } },
    },
  },
  '/admin/topics/{topicId}/lessons/reorder': {
    patch: {
      tags: ['Lessons'],
      summary: 'Reorder lessons in a topic',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('topicId')],
      requestBody: {
        content: {
          'application/json': { example: { lessonIds: ['id1', 'id2'] } },
        },
      },
      responses: { 200: { description: 'Reordered' }, 400: { description: 'Invalid reorder list' } },
    },
  },
  '/admin/lessons/{id}': {
    get: {
      tags: ['Lessons'],
      summary: 'Lesson details (admin)',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      responses: { 200: { description: 'Lesson' } },
    },
    patch: {
      tags: ['Lessons'],
      summary: 'Update lesson',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      responses: { 200: { description: 'Updated' } },
    },
    delete: {
      tags: ['Lessons'],
      summary: 'Soft-archive lesson (preserves historical IDs)',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      responses: { 200: { description: 'Archived' } },
    },
  },
  '/admin/lessons/{id}/status': {
    patch: {
      tags: ['Lessons'],
      summary: 'Change lesson status with publish validation',
      security: [{ bearerAuth: [] }],
      description: 'Requires courses.lessons.publish. Video uploads must be processingStatus=ready (or external URL).',
      parameters: [idParam('id')],
      responses: {
        200: { description: 'Updated' },
        422: { description: 'Publish validation failed' },
      },
    },
  },
  '/admin/lessons/{id}/duplicate': {
    post: {
      tags: ['Lessons'],
      summary: 'Duplicate lesson as draft with new slug',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      responses: { 201: { description: 'Duplicated' } },
    },
  },
  '/admin/lessons/{id}/move': {
    post: {
      tags: ['Lessons'],
      summary: 'Move lesson within the same course',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      requestBody: {
        content: {
          'application/json': {
            example: { targetTopicId: '507f1f77bcf86cd799439011', targetPosition: 2 },
          },
        },
      },
      responses: { 200: { description: 'Moved' }, 422: { description: 'Cross-course move rejected' } },
    },
  },
  '/admin/lessons/{id}/preview': {
    get: {
      tags: ['Lessons'],
      summary: 'Authorized staff preview of lesson',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      responses: { 200: { description: 'Lesson' } },
    },
  },
  '/admin/lessons/{id}/video/upload': {
    post: {
      tags: ['Lessons'],
      summary: 'Upload lesson video to VPS storage (multipart)',
      security: [{ bearerAuth: [] }],
      description:
        'Field name: video. When VIDEO_HLS_ENABLED=false, processingStatus becomes ready for progressive source playback. When true, status stays pending until an external FFmpeg worker verifies HLS. Resumable/chunked upload is NOT implemented.',
      parameters: [idParam('id')],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: { video: { type: 'string', format: 'binary' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Metadata stored' },
        413: { description: 'Too large' },
        415: { description: 'Unsupported type' },
      },
    },
  },
  '/admin/lessons/{id}/video/status': {
    get: {
      tags: ['Lessons'],
      summary: 'Video processing status',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      responses: { 200: { description: 'Status' } },
    },
  },
  '/admin/lessons/{id}/video': {
    delete: {
      tags: ['Lessons'],
      summary: 'Delete uploaded video (reference-aware file cleanup)',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      responses: { 200: { description: 'Deleted' } },
    },
  },
  '/admin/lessons/{id}/attachments': {
    get: {
      tags: ['Attachments'],
      summary: 'List lesson attachments',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      responses: { 200: { description: 'Attachments' } },
    },
    post: {
      tags: ['Attachments'],
      summary: 'Upload attachment (PDF/DOC/XLS/PPT/TXT/ZIP)',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id')],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary' },
                title: { type: 'string' },
                visibility: { type: 'string', enum: ['enrolled', 'preview', 'instructor_only'] },
              },
            },
          },
        },
      },
      responses: { 201: { description: 'Uploaded' }, 415: { description: 'Unsupported' } },
    },
  },
  '/admin/lessons/{id}/attachments/{fileId}': {
    get: {
      tags: ['Attachments'],
      summary: 'Attachment metadata',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id'), idParam('fileId')],
      responses: { 200: { description: 'Attachment' } },
    },
    patch: {
      tags: ['Attachments'],
      summary: 'Update attachment metadata',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id'), idParam('fileId')],
      responses: { 200: { description: 'Updated' } },
    },
    delete: {
      tags: ['Attachments'],
      summary: 'Archive attachment',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('id'), idParam('fileId')],
      responses: { 200: { description: 'Archived' } },
    },
  },
  '/learning/courses/{courseId}/curriculum': {
    get: {
      tags: ['Learning'],
      summary: 'Enrolled / staff learning curriculum',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('courseId')],
      responses: { 200: { description: 'Curriculum with lock flags' } },
    },
  },
  '/learning/lessons/{lessonId}': {
    get: {
      tags: ['Learning'],
      summary: 'Protected lesson payload',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('lessonId')],
      responses: {
        200: { description: 'Lesson' },
        403: { description: 'Not enrolled / scheduled / suspended' },
        404: { description: 'Draft/private' },
      },
    },
  },
  '/learning/lessons/{lessonId}/video/playback': {
    get: {
      tags: ['Learning'],
      summary: 'Issue short-lived playback authorization',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('lessonId')],
      responses: { 200: { description: 'Token or external URL' }, 422: { description: 'Video not ready' } },
    },
  },
  '/learning/lessons/{lessonId}/video/stream': {
    get: {
      tags: ['Learning'],
      summary: 'Stream uploaded video with HTTP Range (requires playback token)',
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam('lessonId'),
        { name: 'token', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: { 200: { description: 'Full file' }, 206: { description: 'Partial content' } },
    },
  },
  '/learning/lessons/{lessonId}/attachments': {
    get: {
      tags: ['Learning'],
      summary: 'List downloadable attachments for eligible learners',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('lessonId')],
      responses: { 200: { description: 'Attachments' } },
    },
  },
  '/learning/lessons/{lessonId}/attachments/{fileId}/download': {
    get: {
      tags: ['Learning'],
      summary: 'Protected attachment download',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('lessonId'), idParam('fileId')],
      responses: { 200: { description: 'File stream' }, 403: { description: 'Forbidden' } },
    },
  },
};

export const curriculumOpenApiTags = [
  { name: 'Attachments', description: 'Lesson study materials on VPS storage' },
];
