import { Queue, Worker } from 'bullmq';
import { env } from '../../../config/env.js';
import { EmailLog, EMAIL_LOG_STATUS } from '../../../models/EmailLog.js';
import { getActiveTemplateBySlug, renderTemplate } from './emailTemplate.service.js';
import { sendSmtpMail } from './smtp.service.js';

const QUEUE_NAME = 'skillbee-email';
let queue = null;
let worker = null;
const memoryJobs = [];

function redisConnection() {
  if (!env.REDIS_ENABLED) return null;
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    maxRetriesPerRequest: null,
  };
}

export function getEmailQueueStatus() {
  return {
    queueEnabled: env.EMAIL_QUEUE_ENABLED,
    bullmq: Boolean(queue),
    worker: Boolean(worker),
    memoryPending: memoryJobs.length,
    inlineWorker: env.EMAIL_INLINE_WORKER,
  };
}

function getQueue() {
  if (!env.EMAIL_QUEUE_ENABLED) return null;
  if (queue) return queue;
  const connection = redisConnection();
  if (!connection) return null;
  try {
    queue = new Queue(QUEUE_NAME, { connection });
    return queue;
  } catch {
    return null;
  }
}

export async function processEmailJob(jobData) {
  const { emailLogId } = jobData;
  const log = await EmailLog.findById(emailLogId);
  if (!log) return { ok: false, reason: 'log_missing' };
  if (log.status === EMAIL_LOG_STATUS.SENT) return { ok: true, duplicate: true };

  log.status = EMAIL_LOG_STATUS.PROCESSING;
  log.attempts = (log.attempts || 0) + 1;
  await log.save();

  try {
    const template = await getActiveTemplateBySlug(log.templateSlug);
    if (!template) {
      throw new Error(`Template inactive or missing: ${log.templateSlug}`);
    }
    const rendered = renderTemplate(template, log.meta?.variables || {});
    const result = await sendSmtpMail({
      to: log.recipient,
      subject: rendered.subject || log.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (result.skipped) {
      // Treat as soft-fail without exhausting retries when SMTP disabled
      log.status = EMAIL_LOG_STATUS.FAILED;
      log.lastError = String(result.reason || 'smtp_skipped').slice(0, 1000);
      await log.save();
      return { ok: false, skipped: true, reason: result.reason };
    }

    log.status = EMAIL_LOG_STATUS.SENT;
    log.providerMessageId = result.messageId;
    log.sentAt = new Date();
    log.lastError = null;
    log.subject = rendered.subject || log.subject;
    await log.save();
    return { ok: true };
  } catch (err) {
    const permanent = /invalid recipient|mailbox unavailable|550|553/i.test(String(err.message));
    log.lastError = String(err.message || err).slice(0, 1000);
    if (permanent || log.attempts >= env.EMAIL_RETRY_LIMIT) {
      log.status = EMAIL_LOG_STATUS.FAILED;
      await log.save();
      return { ok: false, permanent: true };
    }
    log.status = EMAIL_LOG_STATUS.QUEUED;
    await log.save();
    throw err; // allow BullMQ retry
  }
}

async function enqueueMemory(jobData) {
  memoryJobs.push(jobData);
  if (env.EMAIL_INLINE_WORKER) {
    setImmediate(async () => {
      const job = memoryJobs.shift();
      if (!job) return;
      try {
        await processEmailJob(job);
      } catch {
        // retries handled by re-queue in tests via processEmailJob attempts
        if ((job._attempts || 0) < env.EMAIL_RETRY_LIMIT) {
          job._attempts = (job._attempts || 0) + 1;
          memoryJobs.push(job);
          setTimeout(() => {
            const again = memoryJobs.shift();
            if (again) processEmailJob(again).catch(() => undefined);
          }, 50 * job._attempts);
        }
      }
    });
  }
}

/**
 * Create EmailLog + enqueue. Idempotent via eventKey.
 */
export async function enqueueEmail({
  to,
  templateSlug,
  eventType,
  eventKey = null,
  variables = {},
}) {
  if (!to) return { queued: false, reason: 'no_recipient' };

  let log;
  try {
    const template = await getActiveTemplateBySlug(templateSlug);
    const subject = template?.subject || eventType;
    log = await EmailLog.create({
      recipient: String(to).toLowerCase(),
      templateId: template?._id || null,
      templateSlug,
      subject: String(subject).slice(0, 200),
      eventType,
      status: EMAIL_LOG_STATUS.QUEUED,
      eventKey: eventKey || null,
      meta: { variables },
      attempts: 0,
    });
  } catch (err) {
    if (err?.code === 11000 && eventKey) {
      const existing = await EmailLog.findOne({ eventKey });
      return { queued: false, duplicate: true, emailLogId: existing?._id?.toString() };
    }
    throw err;
  }

  const jobData = { emailLogId: log._id.toString() };
  const q = getQueue();
  if (q) {
    try {
      await q.add('send', jobData, {
        jobId: eventKey || log._id.toString(),
        attempts: env.EMAIL_RETRY_LIMIT,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
      return { queued: true, emailLogId: log._id.toString(), via: 'bullmq' };
    } catch {
      await enqueueMemory(jobData);
      return { queued: true, emailLogId: log._id.toString(), via: 'memory_fallback' };
    }
  }

  await enqueueMemory(jobData);
  return { queued: true, emailLogId: log._id.toString(), via: 'memory' };
}

export async function startEmailWorker() {
  if (worker) return worker;
  const connection = redisConnection();
  if (!connection || !env.EMAIL_QUEUE_ENABLED) return null;
  try {
    worker = new Worker(
      QUEUE_NAME,
      async (job) => processEmailJob(job.data),
      { connection, concurrency: 2 }
    );
    worker.on('failed', (job, err) => {
      if (env.NODE_ENV !== 'test') {
        console.warn('[email-worker] failed', job?.id, err.message);
      }
    });
    return worker;
  } catch (err) {
    if (env.NODE_ENV !== 'test') {
      console.warn('[email-worker] start failed:', err.message);
    }
    return null;
  }
}

export async function stopEmailWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  memoryJobs.length = 0;
}

/** Drain memory queue synchronously (tests) */
export async function flushMemoryEmailQueue() {
  while (memoryJobs.length) {
    const job = memoryJobs.shift();
    try {
      // eslint-disable-next-line no-await-in-loop
      await processEmailJob(job);
    } catch {
      // ignore
    }
  }
}
