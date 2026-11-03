const bearer = [{ bearerAuth: [] }];

export const notificationsOpenApiTags = [
  { name: 'Devices' },
  { name: 'Notifications' },
  { name: 'Admin Notifications' },
];

export const notificationsOpenApiPaths = {
  '/student/devices/register': {
    post: {
      tags: ['Devices'],
      summary: 'Register FCM device token',
      security: bearer,
      responses: { 201: { description: 'Registered' } },
    },
  },
  '/student/devices': {
    get: {
      tags: ['Devices'],
      summary: 'List my devices',
      security: bearer,
      responses: { 200: { description: 'Devices' } },
    },
  },
  '/student/devices/{id}': {
    delete: {
      tags: ['Devices'],
      summary: 'Deactivate own device',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Removed' } },
    },
  },
  '/student/notifications': {
    get: {
      tags: ['Notifications'],
      summary: 'List my notifications',
      security: bearer,
      responses: { 200: { description: 'Notifications' } },
    },
  },
  '/notifications/{id}/read': {
    patch: {
      tags: ['Notifications'],
      summary: 'Mark notification as read',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/notifications/read-all': {
    patch: {
      tags: ['Notifications'],
      summary: 'Mark all notifications as read',
      security: bearer,
      responses: { 200: { description: 'Updated' } },
    },
  },
  '/notifications/{id}': {
    delete: {
      tags: ['Notifications'],
      summary: 'Soft-delete own notification',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deleted' } },
    },
  },
  '/admin/notifications': {
    get: {
      tags: ['Admin Notifications'],
      summary: 'Admin notification history',
      security: bearer,
      responses: { 200: { description: 'History' } },
    },
    post: {
      tags: ['Admin Notifications'],
      summary: 'Create custom / course announcement notification',
      security: bearer,
      responses: { 201: { description: 'Created' } },
    },
  },
};
