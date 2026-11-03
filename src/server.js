import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { Permission } from './models/Permission.js';
import { Role } from './models/Role.js';

async function bootstrap() {
  await connectDatabase();
  await Permission.ensureDefaults();
  await Role.ensureDefaults();

  if (env.REDIS_ENABLED) {
    const { initRedis } = await import('./config/redis.js');
    const redisStatus = await initRedis();
    console.log(
      `[redis] enabled=${redisStatus.enabled} connected=${redisStatus.connected} status=${redisStatus.status || 'n/a'}`
    );
  } else {
    console.log('[redis] disabled (set REDIS_ENABLED=true to use cache)');
  }

  // Optional FCM / SMTP / email worker — never blocks boot
  try {
    const { getFirebaseMessaging, getFirebaseStatus } = await import('./config/firebase.js');
    if (env.FIREBASE_ENABLED) {
      await getFirebaseMessaging();
      console.log('[firebase]', JSON.stringify(getFirebaseStatus()));
    } else {
      console.log('[firebase] disabled');
    }
  } catch (err) {
    console.warn('[firebase] init skipped:', err.message);
  }
  try {
    const { getMailTransporter, getSmtpStatus } = await import('./config/smtp.js');
    if (env.EMAIL_ENABLED) {
      getMailTransporter();
      console.log('[smtp]', JSON.stringify({ ...getSmtpStatus(), error: undefined }));
    } else {
      console.log('[smtp] disabled');
    }
  } catch (err) {
    console.warn('[smtp] init skipped:', err.message);
  }
  try {
    const { startEmailWorker } = await import('./modules/email/services/emailQueue.service.js');
    await startEmailWorker();
  } catch (err) {
    console.warn('[email-worker] start skipped:', err.message);
  }

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`Skillbee API listening on port ${env.PORT}`);
    console.log(`Swagger docs: http://localhost:${env.PORT}${env.API_PREFIX}/docs`);
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      const { disconnectDatabase } = await import('./config/database.js');
      const { disconnectRedis } = await import('./config/redis.js');
      try {
        const { stopEmailWorker } = await import('./modules/email/services/emailQueue.service.js');
        await stopEmailWorker();
      } catch {
        /* ignore */
      }
      await disconnectRedis();
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
