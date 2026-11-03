const bearer = [{ bearerAuth: [] }];

export const reviewsOpenApiTags = [
  { name: 'Student Reviews' },
  { name: 'Admin Reviews' },
  { name: 'Public Reviews' },
];

const ReviewCreateBody = {
  type: 'object',
  required: ['rating'],
  properties: {
    rating: { type: 'integer', minimum: 1, maximum: 5 },
    title: { type: 'string', maxLength: 150 },
    comment: { type: 'string', maxLength: 2000 },
  },
};

const ReviewUpdateBody = {
  type: 'object',
  properties: {
    rating: { type: 'integer', minimum: 1, maximum: 5 },
    title: { type: 'string', maxLength: 150 },
    comment: { type: 'string', maxLength: 2000 },
  },
};

const ModerateBody = {
  type: 'object',
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['approved', 'rejected'] },
    rejectionReason: { type: 'string', maxLength: 2000 },
  },
};

export const reviewsOpenApiPaths = {
  '/student/courses/{id}/reviews': {
    post: {
      tags: ['Student Reviews'],
      summary: 'Submit a course review (pending moderation)',
      description:
        'Requires authenticated student with an active (non-revoked, non-expired) enrollment. ' +
        'Optional env REVIEW_REQUIRE_COURSE_COMPLETION=true requires course completion. ' +
        'One review per student per course. New reviews are pending and not public.',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: { required: true, content: { 'application/json': { schema: ReviewCreateBody } } },
      responses: {
        201: { description: 'Created pending review' },
        403: { description: 'Not enrolled / not eligible' },
        409: { description: 'Duplicate review' },
      },
    },
  },
  '/student/reviews/{id}': {
    patch: {
      tags: ['Student Reviews'],
      summary: 'Edit own review (returns to pending)',
      description:
        'Ownership enforced. Status, userId, courseId, and moderation fields cannot be mass-assigned. ' +
        'Edited reviews return to pending.',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: { content: { 'application/json': { schema: ReviewUpdateBody } } },
      responses: { 200: { description: 'Updated' }, 403: { description: 'Not owner' } },
    },
  },
  '/admin/reviews': {
    get: {
      tags: ['Admin Reviews'],
      summary: 'List reviews with filters',
      description:
        'Admin RBAC. Supports pagination, search (student name/email or course title), ' +
        'status, courseId, rating, sort (newest|oldest|highest|lowest).',
      security: bearer,
      responses: { 200: { description: 'Reviews' } },
    },
  },
  '/admin/reviews/{id}': {
    get: {
      tags: ['Admin Reviews'],
      summary: 'Review details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Review' } },
    },
    delete: {
      tags: ['Admin Reviews'],
      summary: 'Soft-delete review',
      description: 'Recalculates course rating stats and invalidates Redis caches.',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deleted' } },
    },
  },
  '/admin/reviews/{id}/status': {
    patch: {
      tags: ['Admin Reviews'],
      summary: 'Approve or reject review',
      description:
        'Records moderatedBy/moderatedAt and moderation history. Only approved reviews affect public stats.',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: { required: true, content: { 'application/json': { schema: ModerateBody } } },
      responses: { 200: { description: 'Moderated' } },
    },
  },
  '/courses/{id}/reviews': {
    get: {
      tags: ['Public Reviews'],
      summary: 'Approved reviews + rating statistics',
      description:
        'Returns averageRating, totalApprovedReviews, distribution (1–5), and paginated approved reviews. ' +
        'Never exposes email, rejection reasons, or moderation internals. Student display: first/last name only.',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'rating', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 5 } },
        {
          name: 'sort',
          in: 'query',
          schema: { type: 'string', enum: ['newest', 'oldest', 'highest', 'lowest'] },
        },
      ],
      responses: { 200: { description: 'Public reviews and stats' } },
    },
  },
};
