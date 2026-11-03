const idParam = (name = 'id') => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
});

export const mediaOpenApiPaths = {
  '/admin/media': {
    get: {
      tags: ['Media'],
      summary: 'List media assets',
      security: [{ bearerAuth: [] }],
      description: 'Permission: media.read. Images/videos are view-only (downloadAllowed=false).',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'mediaType', in: 'query', schema: { type: 'string' } },
        { name: 'category', in: 'query', schema: { type: 'string' } },
        { name: 'storageProvider', in: 'query', schema: { type: 'string' } },
        { name: 'processingStatus', in: 'query', schema: { type: 'string' } },
        { name: 'courseId', in: 'query', schema: { type: 'string' } },
      ],
      responses: { 200: { description: 'Paginated media' } },
    },
  },
  '/admin/media/upload-url': {
    post: {
      tags: ['Media'],
      summary: 'Initiate upload session (Cloudinary signed image OR local VPS token)',
      security: [{ bearerAuth: [] }],
      description:
        'Images → Cloudinary signed params (secret never returned). Client MUST POST the file to Cloudinary uploadUrl, then call /confirm. Videos/documents → local upload token. Resumable uploads NOT implemented.',
      responses: { 201: { description: 'Upload session created' }, 413: { description: 'Too large' }, 415: { description: 'Unsupported type' } },
    },
  },
  '/admin/media/images': {
    post: {
      tags: ['Media'],
      summary: 'Direct multipart image upload to Cloudinary (file appears in Media Library)',
      security: [{ bearerAuth: [] }],
      description:
        'Server streams the image to Cloudinary. Prefer this for Postman/admin tools without a Cloudinary widget. Images are view-only (downloadAllowed=false).',
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary' },
                category: {
                  type: 'string',
                  enum: ['course_thumbnail', 'course_gallery', 'instructor_image', 'other'],
                },
                title: { type: 'string' },
                courseId: { type: 'string' },
              },
              required: ['file'],
            },
          },
        },
      },
      responses: { 201: { description: 'Uploaded + MediaAsset created' } },
    },
  },
  '/admin/media/uploads/{uploadId}/content': {
    put: {
      tags: ['Media'],
      summary: 'Stream local video/document bytes (requires X-Upload-Token)',
      security: [{ bearerAuth: [] }],
      parameters: [idParam('uploadId')],
      responses: { 200: { description: 'Bytes stored temporarily' }, 401: { description: 'Bad/replayed token' } },
    },
  },
  '/admin/media/confirm': {
    post: {
      tags: ['Media'],
      summary: 'Confirm upload and create MediaAsset after verifying file/provider metadata',
      security: [{ bearerAuth: [] }],
      responses: { 201: { description: 'MediaAsset created' }, 422: { description: 'Verification failed' } },
    },
  },
  '/admin/media/storage': {
    get: {
      tags: ['Media'],
      summary: 'Storage statistics (cached)',
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: 'Stats' } },
    },
  },
  '/admin/media/categories': {
    get: {
      tags: ['Media'],
      summary: 'Supported categories and access modes',
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: 'Categories' } },
    },
  },
  '/admin/media/{id}': {
    get: {
      tags: ['Media'],
      summary: 'Media details (no secrets / no absolute paths)',
      security: [{ bearerAuth: [] }],
      parameters: [idParam()],
      responses: { 200: { description: 'Media' } },
    },
    patch: {
      tags: ['Media'],
      summary: 'Update safe metadata only',
      security: [{ bearerAuth: [] }],
      parameters: [idParam()],
      responses: { 200: { description: 'Updated' } },
    },
    delete: {
      tags: ['Media'],
      summary: 'Delete unused media (409 if referenced)',
      security: [{ bearerAuth: [] }],
      parameters: [idParam()],
      responses: { 200: { description: 'Soft-deleted' }, 409: { description: 'In use' } },
    },
  },
  '/admin/media/{id}/restore': {
    post: {
      tags: ['Media'],
      summary: 'Restore soft-deleted media when file still exists',
      security: [{ bearerAuth: [] }],
      parameters: [idParam()],
      responses: { 200: { description: 'Restored' } },
    },
  },
  '/admin/media/{id}/references': {
    get: {
      tags: ['Media'],
      summary: 'Reference scan for safe deletion',
      security: [{ bearerAuth: [] }],
      parameters: [idParam()],
      responses: { 200: { description: 'References' } },
    },
  },
  '/learning/media/{id}/playback': {
    get: {
      tags: ['Media Learning'],
      summary: 'View-only authorization for images/videos (never download)',
      security: [{ bearerAuth: [] }],
      description:
        'Images return Cloudinary secureUrl for display. Videos return short-lived viewToken for inline stream. downloadAllowed is always false for image/video.',
      parameters: [idParam()],
      responses: { 200: { description: 'View authorization' }, 403: { description: 'Not enrolled' } },
    },
  },
  '/learning/media/{id}/stream': {
    get: {
      tags: ['Media Learning'],
      summary: 'Inline video stream with Range (Content-Disposition: inline)',
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam(),
        { name: 'token', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: { 200: { description: 'Full inline stream' }, 206: { description: 'Partial content' } },
    },
  },
};

export const mediaOpenApiTags = [
  { name: 'Media', description: 'Admin media library (Cloudinary images + VPS video/docs)' },
  {
    name: 'Media Learning',
    description: 'Enrollment-gated view/playback — images & videos are show-only, not downloadable',
  },
];
