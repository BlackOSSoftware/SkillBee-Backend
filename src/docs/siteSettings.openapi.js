const bearer = [{ bearerAuth: [] }];

export const siteSettingsOpenApiTags = [{ name: 'Site Settings' }];

export const siteSettingsOpenApiPaths = {
  '/admin/site-settings': {
    get: {
      tags: ['Site Settings'],
      summary: 'Get contact and social settings (admin)',
      security: bearer,
      responses: { 200: { description: 'Settings' } },
    },
    patch: {
      tags: ['Site Settings'],
      summary: 'Update contact, GSTIN, and social links',
      security: bearer,
      responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' } },
    },
  },
  '/site-settings': {
    get: {
      tags: ['Site Settings'],
      summary: 'Public contact and social information',
      responses: { 200: { description: 'Public settings' } },
    },
  },
};
