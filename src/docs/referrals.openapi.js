const bearer = [{ bearerAuth: [] }];

export const referralsOpenApiTags = [
  { name: 'Public Referrals' },
  { name: 'Admin Referrals' },
];

export const referralsOpenApiPaths = {
  '/public/referrals': {
    post: {
      tags: ['Public Referrals'],
      summary: 'Submit refer-your-friend form',
      description:
        'Public rate-limited endpoint. Does not email the referred friend. Triggers admin notification + referrer confirmation email.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'phone', 'friendName', 'friendPhone'],
              properties: {
                name: { type: 'string' },
                email: { type: 'string', format: 'email' },
                phone: { type: 'string' },
                friendName: { type: 'string' },
                friendPhone: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Receipt' },
        409: { description: 'Duplicate recent referral' },
      },
    },
  },
  '/admin/referrals': {
    get: {
      tags: ['Admin Referrals'],
      summary: 'List referrals',
      security: bearer,
      responses: { 200: { description: 'Paginated list' } },
    },
  },
  '/admin/referrals/{id}': {
    get: {
      tags: ['Admin Referrals'],
      summary: 'Referral details (includes private adminNotes)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Details' } },
    },
    delete: {
      tags: ['Admin Referrals'],
      summary: 'Soft-delete referral',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deleted' } },
    },
  },
  '/admin/referrals/{id}/status': {
    patch: {
      tags: ['Admin Referrals'],
      summary: 'Update referral status',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
  },
};
