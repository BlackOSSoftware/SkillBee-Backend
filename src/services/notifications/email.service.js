/**
 * Compatibility facade — delegates to queued Hostinger SMTP pipeline.
 * Keeps existing callers working (QA, fulfillment) without blocking APIs.
 */
import { enqueueEmail } from '../../modules/email/services/emailQueue.service.js';

const sent = new Set();

export async function sendNotificationEmail({
  to,
  subject,
  template,
  idempotencyKey,
  meta = {},
}) {
  const key = idempotencyKey || `${template}:${to}:${subject}`;
  if (sent.has(key)) {
    return { sent: false, duplicate: true };
  }
  sent.add(key);
  if (sent.size > 5000) {
    const first = sent.values().next().value;
    sent.delete(first);
  }

  const slugMap = {
    payment_success: 'payment_successful',
    enrollment_activated: 'course_enrollment',
    free_enrollment: 'course_enrollment',
    qa_admin_reply: 'custom_admin',
  };
  const templateSlug = slugMap[template] || template || 'custom_admin';

  try {
    const result = await enqueueEmail({
      to,
      templateSlug,
      eventType: template || 'custom',
      eventKey: key,
      variables: {
        studentName: meta.studentName || 'Student',
        email: to,
        courseName: meta.courseName || '',
        orderId: meta.orderNumber || meta.orderId || '',
        amount: meta.amount != null ? String(meta.amount) : '',
        currency: meta.currency || '',
        title: subject || 'SkillBee notification',
        message: meta.message || subject || '',
        ...Object.fromEntries(
          Object.entries(meta).filter(([k]) => !/password|secret|token/i.test(k))
        ),
      },
    });
    return { sent: Boolean(result.queued), duplicate: Boolean(result.duplicate), ...result };
  } catch (err) {
    console.log(
      `[email] enqueue failed template=${template} to=${to} err=${err.message}`
    );
    return { sent: false, duplicate: false, error: err.message };
  }
}

export function _resetEmailIdempotencyForTests() {
  sent.clear();
}
