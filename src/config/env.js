import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z.string().default('/api/v1'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CLIENT_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  PASSWORD_RESET_EXPIRES_MINUTES: z.coerce.number().int().positive().default(30),

  UPLOAD_ROOT: z.string().default('./uploads'),
  TEMP_UPLOAD_ROOT: z.string().optional().default(''),
  MAX_VIDEO_SIZE_MB: z.coerce.number().positive().default(2048),
  VIDEO_MAX_SIZE_MB: z.coerce.number().positive().optional(),
  MAX_DOCUMENT_SIZE_MB: z.coerce.number().positive().default(50),
  DOCUMENT_MAX_SIZE_MB: z.coerce.number().positive().optional(),
  IMAGE_MAX_SIZE_MB: z.coerce.number().positive().default(10),
  MAX_STORAGE_USAGE_PERCENT: z.coerce.number().min(1).max(100).default(85),
  UPLOAD_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  STORAGE_STATS_CACHE_SECONDS: z.coerce.number().int().positive().default(60),
  ALLOW_PUBLISH_WITHOUT_LESSONS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  /** When true, students must have courseCompletionStatus=completed to review */
  REVIEW_REQUIRE_COURSE_COMPLETION: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  VIDEO_HLS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  PLAYBACK_TOKEN_SECRET: z.string().min(32).optional(),
  PLAYBACK_TOKEN_EXPIRES_IN: z.string().default('10m'),

  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default('skillbee'),

  // Redis cache (optional — APIs work when disabled/unavailable). Opt-in via REDIS_ENABLED=true
  REDIS_ENABLED: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_KEY_PREFIX: z.string().default('skillbee:'),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),

  // Certificates
  PUBLIC_API_BASE_URL: z.string().optional().default(''),
  CERTIFICATE_NUMBER_PREFIX: z.string().default('SKB'),
  CERTIFICATE_VERIFY_PATH: z.string().default('/certificates/verify'),

  // Commerce / dual payment gateways
  PAYMENT_CURRENCY: z.string().default('INR'),
  PAYMENT_DEFAULT_GATEWAY: z.enum(['razorpay', 'paypal']).optional().default('razorpay'),
  ORDER_NUMBER_PREFIX: z.string().default('SKB-ORD'),
  INVOICE_NUMBER_PREFIX: z.string().default('SKB-INV'),
  FRONTEND_BASE_URL: z.string().optional().default('http://localhost:3000'),
  /** Public website origin used for canonical URLs, sitemap, robots (defaults to FRONTEND_BASE_URL) */
  PUBLIC_SITE_URL: z.string().optional().default(''),
  BACKEND_PUBLIC_URL: z.string().optional().default(''),
  COURSE_PUBLIC_PATH_PREFIX: z.string().optional().default('/courses'),
  /** 32+ byte secret for AES-256-GCM encryption of gateway secrets (hex or utf8) */
  PAYMENT_SECRET_ENCRYPTION_KEY: z.string().optional().default(''),

  RAZORPAY_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),
  RAZORPAY_MODE: z.enum(['test', 'live']).optional().default('test'),
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  PAYPAL_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),
  PAYPAL_MODE: z.enum(['sandbox', 'live']).optional().default('sandbox'),
  PAYPAL_CLIENT_ID: z.string().optional().default(''),
  PAYPAL_CLIENT_SECRET: z.string().optional().default(''),
  PAYPAL_WEBHOOK_ID: z.string().optional().default(''),
  PAYPAL_CURRENCY: z.string().optional().default('USD'),
  /**
   * Trusted FX: major units of PAYPAL_CURRENCY per 1 unit of PAYMENT_CURRENCY (e.g. INR→USD).
   * Empty = no conversion; mismatched currencies reject unless identical.
   */
  PAYMENT_FX_INR_TO_USD: z.string().optional().default(''),

  /** When true, refunds may revoke enrollment (admin can still override per refund) */
  REFUND_REVOKE_ENROLLMENT_DEFAULT: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Firebase Cloud Messaging (optional)
  FIREBASE_ENABLED: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
  /** Private key may contain escaped newlines (\\n) */
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),
  /** Optional path to Firebase service-account JSON (preferred over pasting private key) */
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional().default(''),

  // Hostinger SMTP (optional — APIs continue when disabled/unavailable)
  EMAIL_ENABLED: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  EMAIL_QUEUE_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),
  EMAIL_RETRY_LIMIT: z.coerce.number().int().min(0).max(10).default(3),
  EMAIL_FRONTEND_URL: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default('smtp.hostinger.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_FROM_NAME: z.string().optional().default('SkillBee'),
  SMTP_FROM_EMAIL: z.string().optional().default(''),
  /** Process email jobs inline when Redis/BullMQ unavailable (tests/dev) */
  EMAIL_INLINE_WORKER: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

const data = parsed.data;
if (!data.PLAYBACK_TOKEN_SECRET) {
  data.PLAYBACK_TOKEN_SECRET = data.JWT_ACCESS_SECRET;
}
// Alias preferred Phase 4 names onto existing MAX_* keys
if (data.VIDEO_MAX_SIZE_MB) data.MAX_VIDEO_SIZE_MB = data.VIDEO_MAX_SIZE_MB;
if (data.DOCUMENT_MAX_SIZE_MB) data.MAX_DOCUMENT_SIZE_MB = data.DOCUMENT_MAX_SIZE_MB;
if (!data.TEMP_UPLOAD_ROOT) {
  data.TEMP_UPLOAD_ROOT = `${data.UPLOAD_ROOT}/temporary`;
}
if (!data.PUBLIC_SITE_URL) {
  data.PUBLIC_SITE_URL = data.FRONTEND_BASE_URL || 'http://localhost:3000';
}
if (!data.EMAIL_FRONTEND_URL) {
  data.EMAIL_FRONTEND_URL = data.FRONTEND_BASE_URL || data.PUBLIC_SITE_URL;
}
if (data.FIREBASE_PRIVATE_KEY) {
  data.FIREBASE_PRIVATE_KEY = data.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
}

export const env = data;
