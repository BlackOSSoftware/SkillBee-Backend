import { env } from '../config/env.js';
import { coursesOpenApiPaths, coursesOpenApiTags } from './courses.openapi.js';
import { curriculumOpenApiPaths, curriculumOpenApiTags } from './curriculum.openapi.js';
import { mediaOpenApiPaths, mediaOpenApiTags } from './media.openapi.js';
import { quizzesOpenApiPaths, quizzesOpenApiTags } from './quizzes.openapi.js';
import { assignmentsOpenApiPaths, assignmentsOpenApiTags } from './assignments.openapi.js';
import { enrollmentOpenApiPaths, enrollmentOpenApiTags } from './enrollment.openapi.js';
import { certificatesOpenApiPaths, certificatesOpenApiTags } from './certificates.openapi.js';
import { commerceOpenApiPaths, commerceOpenApiTags } from './commerce.openapi.js';
import { reviewsOpenApiPaths, reviewsOpenApiTags } from './reviews.openapi.js';
import { qaOpenApiPaths, qaOpenApiTags } from './qa.openapi.js';
import { seoOpenApiPaths, seoOpenApiTags } from './seo.openapi.js';
import { siteSettingsOpenApiPaths, siteSettingsOpenApiTags } from './siteSettings.openapi.js';
import { notificationsOpenApiPaths, notificationsOpenApiTags } from './notifications.openapi.js';
import { emailOpenApiPaths, emailOpenApiTags } from './email.openapi.js';
import {
  instructorApplicationsOpenApiPaths,
  instructorApplicationsOpenApiTags,
} from './instructorApplications.openapi.js';
import { newsletterOpenApiPaths, newsletterOpenApiTags } from './newsletter.openapi.js';
import { referralsOpenApiPaths, referralsOpenApiTags } from './referrals.openapi.js';
import { faqsOpenApiPaths, faqsOpenApiTags } from './faqs.openapi.js';
import { blogsOpenApiPaths, blogsOpenApiTags } from './blogs.openapi.js';

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object' } },
      },
      required: ['code', 'message'],
    },
  },
};

const roleSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    permissions: { type: 'array', items: { type: 'string' } },
    isSystem: { type: 'boolean' },
    isActive: { type: 'boolean' },
  },
};

const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    email: { type: 'string', format: 'email' },
    phone: { type: 'string', nullable: true },
    profileImage: { type: 'string', nullable: true },
    roleId: { type: 'string' },
    role: roleSchema,
    status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
    emailVerified: { type: 'boolean' },
    phoneVerified: { type: 'boolean' },
    lastLogin: { type: 'string', format: 'date-time', nullable: true },
    profile: { type: 'object' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    deletedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const bearer = [{ bearerAuth: [] }];

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Skillbee API',
    version: '15.0.0',
    description:
      'Phase 1–15: LMS core, commerce, reviews, Q&A, SEO, Site contact/social settings, Firebase notifications, Hostinger SMTP email queue',
  },
  servers: [
    {
      url: `http://localhost:${env.PORT}${env.API_PREFIX}`,
      description: 'Local development',
    },
  ],
  tags: [
    { name: 'Auth' },
    { name: 'Admin Users' },
    { name: 'Admin Roles' },
    ...coursesOpenApiTags,
    ...curriculumOpenApiTags,
    ...mediaOpenApiTags,
    ...quizzesOpenApiTags,
    ...assignmentsOpenApiTags,
    ...enrollmentOpenApiTags,
    ...certificatesOpenApiTags,
    ...commerceOpenApiTags,
    ...reviewsOpenApiTags,
    ...qaOpenApiTags,
    ...seoOpenApiTags,
    ...siteSettingsOpenApiTags,
    ...notificationsOpenApiTags,
    ...emailOpenApiTags,
    ...instructorApplicationsOpenApiTags,
    ...newsletterOpenApiTags,
    ...referralsOpenApiTags,
    ...faqsOpenApiTags,
    ...blogsOpenApiTags,
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      User: userSchema,
      Role: roleSchema,
      ErrorResponse: errorSchema,
      AuthSuccess: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/User' },
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
            },
          },
        },
      },
    },
  },
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Student registration',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['firstName', 'lastName', 'email', 'password'],
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  phone: { type: 'string' },
                  password: { type: 'string' },
                  profile: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Registered' },
          400: { description: 'Validation error' },
          409: { description: 'Email exists' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Logged in' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh tokens',
        responses: { 200: { description: 'Refreshed' }, 401: { description: 'Invalid' } },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout',
        security: bearer,
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current user',
        security: bearer,
        responses: { 200: { description: 'Profile' } },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Password reset request',
        responses: { 200: { description: 'Accepted' } },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Set new password',
        responses: { 200: { description: 'Updated' } },
      },
    },
    '/admin/users': {
      get: {
        tags: ['Admin Users'],
        summary: 'List users with filters',
        security: bearer,
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'role', in: 'query', schema: { type: 'string' } },
          { name: 'roleId', in: 'query', schema: { type: 'string' } },
          { name: 'includeDeleted', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { 200: { description: 'Users list' } },
      },
      post: {
        tags: ['Admin Users'],
        summary: 'Create user',
        security: bearer,
        responses: { 201: { description: 'Created' } },
      },
    },
    '/admin/users/{id}': {
      get: {
        tags: ['Admin Users'],
        summary: 'User details',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'User' } },
      },
      patch: {
        tags: ['Admin Users'],
        summary: 'Update user',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Admin Users'],
        summary: 'Soft delete user',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Soft deleted' } },
      },
    },
    '/admin/users/{id}/status': {
      patch: {
        tags: ['Admin Users'],
        summary: 'Activate / deactivate / suspend',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Status updated' } },
      },
    },
    '/admin/roles': {
      get: {
        tags: ['Admin Roles'],
        summary: 'List roles',
        security: bearer,
        responses: { 200: { description: 'Roles' } },
      },
      post: {
        tags: ['Admin Roles'],
        summary: 'Create role',
        security: bearer,
        responses: { 201: { description: 'Created' } },
      },
    },
    '/admin/roles/{id}': {
      patch: {
        tags: ['Admin Roles'],
        summary: 'Update role',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Admin Roles'],
        summary: 'Delete unused role',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/admin/roles/{id}/permissions': {
      patch: {
        tags: ['Admin Roles'],
        summary: 'Assign permissions',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Assigned' } },
      },
    },
    '/admin/permissions': {
      get: {
        tags: ['Admin Roles'],
        summary: 'List permissions',
        security: bearer,
        responses: { 200: { description: 'Permissions' } },
      },
    },
    ...coursesOpenApiPaths,
    ...curriculumOpenApiPaths,
    ...mediaOpenApiPaths,
    ...quizzesOpenApiPaths,
    ...assignmentsOpenApiPaths,
    ...enrollmentOpenApiPaths,
    ...certificatesOpenApiPaths,
    ...commerceOpenApiPaths,
    ...reviewsOpenApiPaths,
    ...qaOpenApiPaths,
    ...seoOpenApiPaths,
    ...siteSettingsOpenApiPaths,
    ...notificationsOpenApiPaths,
    ...emailOpenApiPaths,
    ...instructorApplicationsOpenApiPaths,
    ...newsletterOpenApiPaths,
    ...referralsOpenApiPaths,
    ...faqsOpenApiPaths,
    ...blogsOpenApiPaths,
  },
};
