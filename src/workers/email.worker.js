/**
 * Standalone email worker process (optional).
 * Prefer starting via server bootstrap when Redis+BullMQ are available.
 */
import { connectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { startEmailWorker, stopEmailWorker } from '../modules/email/services/emailQueue.service.js';

async function main() {
  await connectDatabase();
  if (env.REDIS_ENABLED) {
    const { initRedis } = await import('../config/redis.js');
    await initRedis();
  }
  const worker = await startEmailWorker();
  if (!worker) {
    console.log('[email-worker] BullMQ worker not started (Redis disabled or unavailable). Exiting.');
    process.exit(0);
  }
  console.log('[email-worker] listening for jobs');

  const shutdown = async () => {
    await stopEmailWorker();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[email-worker] fatal:', err.message);
  process.exit(1);
});
