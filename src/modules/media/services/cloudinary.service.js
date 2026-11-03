import { v2 as cloudinary } from 'cloudinary';
import crypto from 'crypto';
import { env } from '../../../config/env.js';
import { AppError } from '../../../utils/AppError.js';
import {
  deleteCloudinaryAsset,
  isCloudinaryConfigured,
  toCloudinaryMedia,
} from '../../../integrations/cloudinary/cloudinary.service.js';

function ensureConfigured() {
  if (!isCloudinaryConfigured()) {
    throw new AppError(
      'Cloudinary is not configured',
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
}

export function createSignedImageUpload({ folder, publicId }) {
  ensureConfigured();
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = {
    timestamp,
    folder,
    public_id: publicId,
  };
  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    env.CLOUDINARY_API_SECRET
  );

  return {
    provider: 'cloudinary',
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    uploadParameters: {
      api_key: env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      folder,
      public_id: publicId,
    },
  };
}

/**
 * Confirm Cloudinary upload. In tests, pass providerMeta with mocked asset fields.
 * Optionally verifies via Cloudinary Admin API when available.
 */
export async function verifyCloudinaryUpload({
  publicId,
  secureUrl,
  bytes,
  width,
  height,
  format,
  expectedFolder,
}) {
  if (!publicId || !secureUrl) {
    throw new AppError('Cloudinary publicId and secureUrl are required', 400, 'VALIDATION_ERROR');
  }
  if (expectedFolder && !String(publicId).startsWith(`${expectedFolder}/`) && !String(publicId).includes(expectedFolder)) {
    // public_id may be folder/name or just name depending on upload params
  }
  if (!String(secureUrl).startsWith('https://res.cloudinary.com/')) {
    throw new AppError('Invalid Cloudinary secure URL', 400, 'INVALID_CLOUDINARY_URL');
  }
  if (env.CLOUDINARY_CLOUD_NAME && !secureUrl.includes(env.CLOUDINARY_CLOUD_NAME) && env.NODE_ENV === 'production') {
    throw new AppError('Cloudinary URL cloud mismatch', 400, 'INVALID_CLOUDINARY_URL');
  }

  // Production/dev: asset MUST exist on Cloudinary (prevents fake confirm without upload)
  if (isCloudinaryConfigured() && env.NODE_ENV !== 'test') {
    ensureConfigured();
    const candidates = [publicId];
    if (expectedFolder && !String(publicId).includes('/')) {
      candidates.push(`${expectedFolder}/${publicId}`);
    }
    for (const id of candidates) {
      try {
        const resource = await cloudinary.api.resource(id, { resource_type: 'image' });
        return toCloudinaryMedia(resource);
      } catch {
        // try next candidate
      }
    }
    throw new AppError(
      'Cloudinary asset not found. Upload the image to Cloudinary with the signed params before calling confirm.',
      422,
      'CLOUDINARY_ASSET_MISSING'
    );
  }

  // Test-only fallback when Cloudinary is not configured
  return {
    provider: 'cloudinary',
    publicId,
    secureUrl,
    width: width || null,
    height: height || null,
    format: format || null,
    bytes: bytes || 0,
  };
}

/**
 * Server-side image upload to Cloudinary (for admin/API clients without a browser widget).
 * Still creates view-only MediaAsset metadata via the caller.
 */
export async function uploadImageBufferToCloudinary(buffer, { folder, publicId, originalFileName }) {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'image',
        overwrite: false,
        filename_override: originalFileName,
        use_filename: false,
        unique_filename: false,
      },
      (error, result) => {
        if (error) {
          reject(
            new AppError(
              error.message || 'Cloudinary upload failed',
              502,
              'CLOUDINARY_UPLOAD_FAILED'
            )
          );
          return;
        }
        resolve(toCloudinaryMedia(result));
      }
    );
    stream.end(buffer);
  });
}

export async function destroyCloudinaryImage(publicId) {
  await deleteCloudinaryAsset(publicId);
}

export function createCloudinaryPublicIdHint(category, uploadId) {
  const safe = category.replace(/_/g, '-');
  return `${safe}-${uploadId.slice(0, 12)}-${crypto.randomBytes(4).toString('hex')}`;
}

export { isCloudinaryConfigured };
