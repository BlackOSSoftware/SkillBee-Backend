import { sendNotificationEmail } from '../../../services/notifications/email.service.js';

/**
 * Fire-and-forget notification wrapper.
 *
 * The underlying pipeline records every attempt in EmailLog (recipient,
 * template, subject, status). When SMTP is disabled the log entry is marked
 * `simulated` — creation flows must never fail because email is unavailable,
 * and callers must never treat a queued/simulated notification as delivered.
 */
export async function notify({ to, subject, template, idempotencyKey, meta = {} }) {
  if (!to) return { notified: false, reason: 'no_recipient' };
  try {
    const result = await sendNotificationEmail({ to, subject, template, idempotencyKey, meta });
    return { notified: Boolean(result.queued) && !result.duplicate, duplicate: Boolean(result.duplicate), result };
  } catch (err) {
    console.warn(`[contact-notify] ${template} failed: ${err.message}`);
    return { notified: false, error: err.message };
  }
}
