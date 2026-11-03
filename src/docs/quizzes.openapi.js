export const quizzesOpenApiTags = [
  { name: 'Admin Quizzes' },
  { name: 'Question Bank' },
  { name: 'Student Quizzes' },
  { name: 'Quiz Attempts' },
];

const bearer = [{ bearerAuth: [] }];
const err = {
  400: { description: 'Validation error' },
  401: { description: 'Unauthorized' },
  403: { description: 'Forbidden' },
  404: { description: 'Not found' },
  409: { description: 'Conflict' },
  422: { description: 'Unprocessable' },
};

export const quizzesOpenApiPaths = {
  '/admin/quizzes': {
    get: {
      tags: ['Admin Quizzes'],
      summary: 'List quizzes',
      security: bearer,
      description: 'RBAC: quizzes.read. Filters: search, courseId, lessonId, status, createdBy, dates, pagination.',
      parameters: [
        { name: 'courseId', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'published', 'archived'] } },
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
      ],
      responses: { 200: { description: 'Quiz list' }, ...err },
    },
    post: {
      tags: ['Admin Quizzes'],
      summary: 'Create quiz',
      security: bearer,
      description: 'RBAC: quizzes.create. Lifecycle start: Create → Configure → Add Questions → Publish.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'courseId'],
              properties: {
                title: { type: 'string', example: 'Introduction to CSV' },
                courseId: { type: 'string' },
                timeLimitSeconds: { type: 'integer', example: 1800 },
                passingPercentage: { type: 'number', example: 60 },
                maximumAttempts: { type: 'integer', example: 2 },
                negativeMarkingEnabled: { type: 'boolean' },
                negativeMarksPerWrongAnswer: { type: 'number', example: 0.25 },
                randomizeQuestions: { type: 'boolean' },
                showResults: {
                  type: 'string',
                  enum: ['immediate', 'after_submission', 'after_manual_grading', 'scheduled'],
                },
              },
            },
          },
        },
      },
      responses: { 201: { description: 'Created' }, ...err },
    },
  },
  '/admin/quizzes/{id}': {
    get: {
      tags: ['Admin Quizzes'],
      summary: 'Get quiz details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Quiz' }, ...err },
    },
    patch: {
      tags: ['Admin Quizzes'],
      summary: 'Update quiz settings',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' }, ...err },
    },
    delete: {
      tags: ['Admin Quizzes'],
      summary: 'Archive quiz (soft delete)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Archived' }, ...err },
    },
  },
  '/admin/quizzes/{id}/status': {
    patch: {
      tags: ['Admin Quizzes'],
      summary: 'Publish / unpublish / archive quiz',
      security: bearer,
      description: 'RBAC: quizzes.publish. Validates questions, marks, course/lesson, availability before publish.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['draft', 'published', 'archived'] },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Status changed' }, ...err },
    },
  },
  '/admin/quizzes/{id}/questions': {
    get: {
      tags: ['Admin Quizzes'],
      summary: 'List quiz questions (includes answer keys)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Questions with keys' }, ...err },
    },
    post: {
      tags: ['Admin Quizzes'],
      summary: 'Add question',
      security: bearer,
      description: 'Types: multiple_choice, multiple_select, true_false, short_answer, long_answer, fill_in_the_blanks',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['questionText', 'questionType', 'marks'],
              properties: {
                questionText: { type: 'string' },
                questionType: {
                  type: 'string',
                  enum: [
                    'multiple_choice',
                    'multiple_select',
                    'true_false',
                    'short_answer',
                    'long_answer',
                    'fill_in_the_blanks',
                  ],
                },
                marks: { type: 'number' },
                options: { type: 'array', items: { type: 'object' } },
                correctOptionIds: { type: 'array', items: { type: 'string' } },
              },
            },
            example: {
              questionText: 'What does CSV stand for?',
              questionType: 'multiple_choice',
              marks: 1,
              options: [
                { id: 'a', text: 'Computerized System Validation' },
                { id: 'b', text: 'Computer System Verification' },
                { id: 'c', text: 'Controlled Software Validation' },
                { id: 'd', text: 'Computerized Software Verification' },
              ],
              correctOptionIds: ['a'],
              explanation:
                'CSV is establishing documented evidence that a computerized system performs as intended.',
            },
          },
        },
      },
      responses: { 201: { description: 'Question created' }, ...err },
    },
  },
  '/admin/quizzes/{id}/questions/reorder': {
    patch: {
      tags: ['Admin Quizzes'],
      summary: 'Reorder questions (atomic, complete list)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['questionIds'],
              properties: {
                questionIds: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Ordered questions' }, ...err },
    },
  },
  '/admin/quizzes/{id}/questions/from-bank': {
    post: {
      tags: ['Admin Quizzes'],
      summary: 'Import questions from bank (snapshots content)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 201: { description: 'Imported' }, ...err },
    },
  },
  '/admin/quizzes/questions/{questionId}': {
    patch: {
      tags: ['Admin Quizzes'],
      summary: 'Update question',
      security: bearer,
      parameters: [{ name: 'questionId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' }, ...err },
    },
    delete: {
      tags: ['Admin Quizzes'],
      summary: 'Archive question',
      security: bearer,
      parameters: [{ name: 'questionId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Archived' }, ...err },
    },
  },
  '/admin/quizzes/{id}/duplicate': {
    post: {
      tags: ['Admin Quizzes'],
      summary: 'Duplicate quiz as draft (no attempts copied)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 201: { description: 'Duplicated' }, ...err },
    },
  },
  '/admin/quizzes/{id}/attempts': {
    get: {
      tags: ['Quiz Attempts'],
      summary: 'List attempts for a quiz',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Attempts' }, ...err },
    },
  },
  '/admin/quizzes/{id}/analytics': {
    get: {
      tags: ['Admin Quizzes'],
      summary: 'Quiz analytics (aggregated, not fabricated)',
      security: bearer,
      description: 'RBAC: quizzes.analytics.read',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Analytics' }, ...err },
    },
  },
  '/admin/question-bank': {
    get: {
      tags: ['Question Bank'],
      summary: 'List question bank',
      security: bearer,
      responses: { 200: { description: 'Bank items' }, ...err },
    },
    post: {
      tags: ['Question Bank'],
      summary: 'Create bank question',
      security: bearer,
      responses: { 201: { description: 'Created' }, ...err },
    },
  },
  '/admin/question-bank/categories': {
    get: {
      tags: ['Question Bank'],
      summary: 'List bank categories',
      security: bearer,
      responses: { 200: { description: 'Categories' }, ...err },
    },
  },
  '/admin/question-bank/{id}': {
    get: {
      tags: ['Question Bank'],
      summary: 'Get bank question',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Item' }, ...err },
    },
    patch: {
      tags: ['Question Bank'],
      summary: 'Update bank question (does not rewrite historical attempts)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' }, ...err },
    },
    delete: {
      tags: ['Question Bank'],
      summary: 'Archive bank question',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Archived' }, ...err },
    },
  },
  '/admin/quiz-attempts': {
    get: {
      tags: ['Quiz Attempts'],
      summary: 'List quiz attempts',
      security: bearer,
      responses: { 200: { description: 'Attempts' }, ...err },
    },
  },
  '/admin/quiz-attempts/{id}': {
    get: {
      tags: ['Quiz Attempts'],
      summary: 'Admin attempt detail (includes keys)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Attempt' }, ...err },
    },
  },
  '/admin/quiz-attempts/{id}/result': {
    get: {
      tags: ['Quiz Attempts'],
      summary: 'Admin result view',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Result' }, ...err },
    },
  },
  '/admin/quiz-attempts/{id}/grading': {
    get: {
      tags: ['Quiz Attempts'],
      summary: 'Manual grading view',
      security: bearer,
      description: 'RBAC: quizzes.grade',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Pending grades' }, ...err },
    },
  },
  '/admin/quiz-attempts/{id}/grade': {
    patch: {
      tags: ['Quiz Attempts'],
      summary: 'Submit manual grades',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['grades'],
              properties: {
                grades: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      questionId: { type: 'string' },
                      marksAwarded: { type: 'number' },
                      feedback: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Graded' }, ...err },
    },
  },
  '/student/quizzes/{id}/start': {
    post: {
      tags: ['Student Quizzes'],
      summary: 'Start quiz attempt (server timer + snapshots)',
      security: bearer,
      description:
        'Enrollment, publish, schedule, attempt limits enforced. Returns questions without answer keys. expiresAt is server-owned.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        201: {
          description: 'Attempt started',
          content: {
            'application/json': {
              example: {
                success: true,
                data: {
                  attemptId: '6610...',
                  startedAt: '2026-11-02T10:00:00.000Z',
                  expiresAt: '2026-11-02T10:30:00.000Z',
                  timeLimitSeconds: 1800,
                  questions: [],
                },
              },
            },
          },
        },
        ...err,
      },
    },
  },
  '/student/quiz-attempts/{id}/submit': {
    post: {
      tags: ['Student Quizzes'],
      summary: 'Submit answers (server-side scoring)',
      security: bearer,
      description:
        'Rejects scoring fields from client. Atomic status transition. Late submissions after expiresAt rejected (boundary: expiresAt <= now).',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                answers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      questionId: { type: 'string' },
                      answer: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Result (per showResults policy)' }, ...err },
    },
  },
  '/student/quiz-attempts/{id}/result': {
    get: {
      tags: ['Student Quizzes'],
      summary: 'Get own attempt result',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Result or hidden message' }, ...err },
    },
  },
};
