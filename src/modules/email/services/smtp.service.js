import { env } from '../../../config/env.js';
import { getMailTransporter, getSmtpStatus } from '../../../config/smtp.js';

/**
 * Send one email via Hostinger SMTP (or mock). Never logs passwords.
 */
export async function sendSmtpMail({ to, subject, html, text }) {
  if (!env.EMAIL_ENABLED) {
    return { sent: false, skipped: true, reason: 'email_disabled' };
  }

  const transporter = getMailTransporter();
  if (!transporter) {
    return { sent: false, skipped: true, reason: 'smtp_unconfigured', status: getSmtpStatus() };
  }

  const fromName = env.SMTP_FROM_NAME || 'SkillBee';
  const fromEmail = env.SMTP_FROM_EMAIL;
  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    text,
  });

  return {
    sent: true,
    skipped: false,
    messageId: info.messageId || null,
  };
}
