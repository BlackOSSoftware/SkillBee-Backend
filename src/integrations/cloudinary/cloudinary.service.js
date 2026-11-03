import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new AppError(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      503,
      'CLOUDINARY_NOT_CONFIGURED'
    );
  }

  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

export function isCloudinaryConfigured() {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
  );
}

export function toCloudinaryMedia(result) {
  return {
    provider: 'cloudinary',
    publicId: result.public_id,
    secureUrl: result.secure_url,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
  };
}

export async function uploadImageBuffer(buffer, { folder = 'skillbee/courses', filename } = {}) {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        public_id: filename,
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          reject(new AppError('Cloudinary upload failed', 502, 'CLOUDINARY_UPLOAD_FAILED'));
          return;
        }
        resolve(toCloudinaryMedia(result));
      }
    );
    stream.end(buffer);
  });
}

export async function deleteCloudinaryAsset(publicId) {
  if (!publicId || !isCloudinaryConfigured()) return;
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image' }).catch(() => {});
}

/**
 * Accept already-uploaded Cloudinary media metadata from admin clients
 * that uploaded directly to Cloudinary (signed upload / frontend widget).
 */
export function normalizeCloudinaryInput(input) {
  if (!input) return null;
  if (!input.publicId || !input.secureUrl) {
    throw new AppError('Invalid Cloudinary media reference', 400, 'INVALID_MEDIA');
  }
  if (String(input.secureUrl).includes('tmp') && !input.publicId) {
    throw new AppError('Temporary media URLs are not allowed', 400, 'INVALID_MEDIA');
  }
  return {
    provider: 'cloudinary',
    publicId: String(input.publicId),
    secureUrl: String(input.secureUrl),
    width: input.width,
    height: input.height,
    format: input.format,
    bytes: input.bytes,
  };
}
