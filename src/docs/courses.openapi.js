export const coursesOpenApiPaths = {
  '/admin/courses': {
    get: {
      tags: ['Admin Courses'],
      summary: 'List courses with filters',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string' } },
        { name: 'categoryId', in: 'query', schema: { type: 'string' } },
        { name: 'instructorId', in: 'query', schema: { type: 'string' } },
        { name: 'pricingType', in: 'query', schema: { type: 'string' } },
      ],
      responses: { 200: { description: 'Paginated courses' } },
    },
    post: {
      tags: ['Admin Courses'],
      summary: 'Create course (draft)',
      security: [{ bearerAuth: [] }],
      responses: { 201: { description: 'Created' } },
    },
  },
  '/admin/courses/{id}': {
    get: {
      tags: ['Admin Courses'],
      summary: 'Get course details',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Course' } },
    },
    patch: {
      tags: ['Admin Courses'],
      summary: 'Update course',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
    delete: {
      tags: ['Admin Courses'],
      summary: 'Soft delete course',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Soft deleted' } },
    },
  },
  '/admin/courses/{id}/status': {
    patch: {
      tags: ['Admin Courses'],
      summary: 'Publish / unpublish / archive',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Status updated' }, 422: { description: 'Publish validation failed' } },
    },
  },
  '/admin/courses/{id}/duplicate': {
    post: {
      tags: ['Admin Courses'],
      summary: 'Duplicate course with curriculum',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 201: { description: 'Duplicated draft course' } },
    },
  },
  '/admin/courses/{id}/analytics': {
    get: {
      tags: ['Admin Courses'],
      summary: 'Course analytics',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Analytics' } },
    },
  },
  '/admin/courses/{courseId}/topics': {
    get: {
      tags: ['Curriculum'],
      summary: 'List topics',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Topics' } },
    },
    post: {
      tags: ['Curriculum'],
      summary: 'Create topic',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 201: { description: 'Created' } },
    },
  },
  '/admin/topics/{topicId}/lessons': {
    get: {
      tags: ['Lessons'],
      summary: 'List lessons by topic',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'topicId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Lessons' } },
    },
    post: {
      tags: ['Lessons'],
      summary: 'Create lesson',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'topicId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 201: { description: 'Created' } },
    },
  },
  '/admin/lessons/{lessonId}/video': {
    post: {
      tags: ['Lessons'],
      summary: 'Upload lesson video (multipart)',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'lessonId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Video metadata attached' } },
    },
  },
  '/admin/course-categories': {
    get: {
      tags: ['Categories'],
      summary: 'List categories',
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: 'Categories' } },
    },
    post: {
      tags: ['Categories'],
      summary: 'Create category',
      security: [{ bearerAuth: [] }],
      responses: { 201: { description: 'Created' } },
    },
  },
  '/admin/instructors': {
    get: {
      tags: ['Instructors'],
      summary: 'List instructors',
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: 'Instructors' } },
    },
  },
  '/courses': {
    get: {
      tags: ['Public Courses'],
      summary: 'List published courses',
      responses: { 200: { description: 'Published courses' } },
    },
  },
  '/courses/featured': {
    get: {
      tags: ['Public Courses'],
      summary: 'Featured courses',
      responses: { 200: { description: 'Featured courses' } },
    },
  },
  '/courses/{slug}': {
    get: {
      tags: ['Public Courses'],
      summary: 'Public course detail',
      parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Course' }, 404: { description: 'Not found' } },
    },
  },
  '/courses/{slug}/curriculum': {
    get: {
      tags: ['Public Courses'],
      summary: 'Public curriculum (preview-aware)',
      parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Curriculum' } },
    },
  },
  '/learning/resources/{resourceId}/download': {
    get: {
      tags: ['Learning'],
      summary: 'Protected resource download',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'resourceId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'File stream or external URL' }, 403: { description: 'Not enrolled' } },
    },
  },
  '/learning/lessons/{lessonId}/playback-token': {
    post: {
      tags: ['Learning'],
      summary: 'Short-lived video playback authorization',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'lessonId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Playback token' } },
    },
  },
};

export const coursesOpenApiTags = [
  { name: 'Admin Courses', description: 'Course builder admin APIs' },
  { name: 'Categories', description: 'Course categories' },
  { name: 'Instructors', description: 'Instructor directory' },
  { name: 'Curriculum', description: 'Topics / chapters' },
  { name: 'Lessons', description: 'Lesson management & video upload' },
  { name: 'Public Courses', description: 'Public catalog' },
  { name: 'Learning', description: 'Enrolled learner protected media' },
];
