import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '5001';
process.env.API_PREFIX = '/api/v1';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'test-access-secret-at-least-32-chars-long';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-at-least-32-chars-long';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.CLIENT_ORIGINS = 'http://localhost:3000,http://localhost:3001';
process.env.COOKIE_SECURE = 'false';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX = '1000';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.PASSWORD_RESET_EXPIRES_MINUTES = '30';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skillbee-test';
process.env.UPLOAD_ROOT = process.env.UPLOAD_ROOT || './uploads-test';
process.env.TEMP_UPLOAD_ROOT = process.env.TEMP_UPLOAD_ROOT || './uploads-test/temporary';
process.env.MAX_VIDEO_SIZE_MB = process.env.MAX_VIDEO_SIZE_MB || '50';
process.env.MAX_DOCUMENT_SIZE_MB = process.env.MAX_DOCUMENT_SIZE_MB || '5';
process.env.IMAGE_MAX_SIZE_MB = process.env.IMAGE_MAX_SIZE_MB || '5';
process.env.UPLOAD_SESSION_TTL_MINUTES = process.env.UPLOAD_SESSION_TTL_MINUTES || '30';
process.env.MAX_STORAGE_USAGE_PERCENT = process.env.MAX_STORAGE_USAGE_PERCENT || '95';
process.env.ALLOW_PUBLISH_WITHOUT_LESSONS = 'false';
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '';
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';
// Never connect to real Redis during automated tests (dotenv may set REDIS_ENABLED=true)
process.env.REDIS_ENABLED = 'false';
process.env.ALLOW_PUBLISH_WITHOUT_LESSONS = 'true';
process.env.PAYMENT_SECRET_ENCRYPTION_KEY =
  process.env.PAYMENT_SECRET_ENCRYPTION_KEY || 'test-encryption-key-32chars-min!!';
process.env.RAZORPAY_ENABLED = process.env.RAZORPAY_ENABLED || 'true';
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_skillbee';
process.env.RAZORPAY_KEY_SECRET =
  process.env.RAZORPAY_KEY_SECRET || 'test_razorpay_secret_key_value';
process.env.RAZORPAY_WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_test_skillbee';
process.env.RAZORPAY_MODE = process.env.RAZORPAY_MODE || 'test';
process.env.PAYPAL_ENABLED = process.env.PAYPAL_ENABLED || 'true';
process.env.PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
process.env.PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'paypal_test_client_id';
process.env.PAYPAL_CLIENT_SECRET =
  process.env.PAYPAL_CLIENT_SECRET || 'paypal_test_client_secret_value';
process.env.PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || 'WH-TEST-SKILLBEE';
process.env.PAYPAL_CURRENCY = process.env.PAYPAL_CURRENCY || 'USD';
process.env.PAYMENT_FX_INR_TO_USD = process.env.PAYMENT_FX_INR_TO_USD || '0.012';
process.env.PAYMENT_DEFAULT_GATEWAY = process.env.PAYMENT_DEFAULT_GATEWAY || 'razorpay';
process.env.FIREBASE_ENABLED = process.env.FIREBASE_ENABLED || 'false';
process.env.EMAIL_ENABLED = process.env.EMAIL_ENABLED || 'false';
process.env.EMAIL_INLINE_WORKER = process.env.EMAIL_INLINE_WORKER || 'true';
process.env.EMAIL_QUEUE_ENABLED = process.env.EMAIL_QUEUE_ENABLED || 'true';

let memoryServer;

export async function startTestDatabase() {
  memoryServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = memoryServer.getUri();

  const { connectDatabase } = await import('../../src/config/database.js');
  const { Permission } = await import('../../src/models/Permission.js');
  const { Role } = await import('../../src/models/Role.js');

  await connectDatabase(process.env.MONGODB_URI);
  // Ensure schema indexes (incl. Course $text) exist before any suite hits search APIs.
  // autoIndex is async and races with early $text queries under MongoMemoryServer.
  await import('../../src/models/Course.js');
  await import('../../src/models/CourseReview.js');
  await import('../../src/models/User.js');
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.syncIndexes().catch(() => undefined))
  );
  await Permission.ensureDefaults();
  await Role.ensureDefaults();
}

export async function stopTestDatabase() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
  }
}

export async function clearCollections() {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
  const { Permission } = await import('../../src/models/Permission.js');
  const { Role } = await import('../../src/models/Role.js');
  await Permission.ensureDefaults();
  await Role.ensureDefaults();
}

export async function createTestApp() {
  const { createApp } = await import('../../src/app.js');
  return createApp();
}

export async function promoteToRole(email, roleSlug) {
  const { User } = await import('../../src/models/User.js');
  const { Role } = await import('../../src/models/Role.js');
  const role = await Role.findBySlug(roleSlug);
  await User.updateOne({ email }, { roleId: role._id });
  return role;
}
