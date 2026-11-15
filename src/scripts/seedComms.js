import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { AppNotification } from '../models/AppNotification.js';
import { EmailLog } from '../models/EmailLog.js';
import { Role } from '../models/Role.js';
import { SiteSettings } from '../models/SiteSettings.js';
import { User } from '../models/User.js';

/**
 * Development-only seed for admin Notifications / Email / Site Settings testing.
 * Idempotent:
 *   - Notifications use eventKey `seed-ntf-*` (unique per recipient).
 *   - Email logs use eventKey `seed-mail-*` (unique).
 *   - Site settings are only populated when contact.companyName is empty,
 *     so admin edits are never clobbered.
 * Cleanup:
 *   AppNotification.deleteMany({ eventKey: /^seed-ntf-/ })
 *   EmailLog.deleteMany({ eventKey: /^seed-mail-/ })
 */
if (env.NODE_ENV === 'production') {
  console.error('seedComms is development-only and refuses to run in production.');
  process.exit(1);
}

const DAY = 24 * 60 * 60 * 1000;

async function seedNotifications(adminId, students) {
  if (!students.length) {
    console.log('  notifications: no student users found — skipped');
    return;
  }
  const defs = [
    { type: 'course_announcement', title: 'New batch starting soon', message: 'Registrations for the Advanced React batch open next week. Seats are limited.', category: 'announcement', deliveryStatus: 'sent', offsetDays: 0.2, read: false },
    { type: 'custom', title: 'Maintenance window', message: 'Scheduled maintenance this Sunday 02:00–04:00 IST. The platform may be briefly unavailable.', category: 'announcement', deliveryStatus: 'partial', offsetDays: 1.5, read: true },
    { type: 'payment_successful', title: 'Payment received', message: 'Your payment of ₹4,999 was successful. Your course access is now active.', category: 'billing', deliveryStatus: 'sent', offsetDays: 3, read: true },
    { type: 'assignment_evaluated', title: 'Assignment evaluated', message: 'Your submission for "React Hooks Deep Dive" has been evaluated. Score: 18/20.', category: 'learning', deliveryStatus: 'sent', offsetDays: 5, read: false },
    { type: 'certificate_generated', title: 'Certificate ready', message: 'Congratulations! Your course completion certificate is ready to download.', category: 'learning', deliveryStatus: 'failed', offsetDays: 8, read: false },
  ];

  let created = 0;
  for (const [i, def] of defs.entries()) {
    const recipient = students[i % students.length];
    const eventKey = `seed-ntf-${def.type}-${recipient._id}`;
    const exists = await AppNotification.findOne({ eventKey });
    if (exists) continue;
    const createdAt = new Date(Date.now() - def.offsetDays * DAY);
    await AppNotification.create({
      recipientId: recipient._id,
      recipientRole: 'student',
      title: def.title,
      message: def.message,
      type: def.type,
      category: def.category,
      data: { seed: true, courseTitle: 'Advanced React' },
      isRead: def.read,
      readAt: def.read ? new Date(createdAt.getTime() + 3600_000) : null,
      createdBy: adminId ?? null,
      deliveryStatus: def.deliveryStatus,
      deliveryMeta: { seed: true },
      eventKey,
      createdAt,
      updatedAt: createdAt,
    });
    created += 1;
  }
  console.log(`  notifications: ${created} created (${defs.length - created} already existed)`);
}

async function seedEmailLogs(users) {
  const recipients = users.slice(0, 4).map((u) => u.email).filter(Boolean);
  if (!recipients.length) recipients.push('seed-student@example.com');

  const defs = [
    { eventType: 'payment_successful', subject: 'Payment received — order #SEED-1001', status: 'sent', attempts: 1, offsetDays: 0.5, sent: true },
    { eventType: 'welcome', subject: 'Welcome to SkillBee', status: 'simulated', attempts: 1, offsetDays: 1, sent: false },
    { eventType: 'assignment_evaluated', subject: 'Your assignment was evaluated', status: 'failed', attempts: 3, offsetDays: 2, sent: false, error: 'SMTP connection timeout (seeded failure for testing)' },
    { eventType: 'certificate_generated', subject: 'Your certificate is ready', status: 'queued', attempts: 0, offsetDays: 0.1, sent: false },
    { eventType: 'password_reset', subject: 'Reset your password', status: 'sent', attempts: 1, offsetDays: 4, sent: true },
  ];

  let created = 0;
  for (const [i, def] of defs.entries()) {
    const eventKey = `seed-mail-${def.eventType}-${i}`;
    const exists = await EmailLog.findOne({ eventKey });
    if (exists) continue;
    const createdAt = new Date(Date.now() - def.offsetDays * DAY);
    await EmailLog.create({
      recipient: recipients[i % recipients.length],
      templateSlug: def.eventType === 'welcome' ? 'welcome' : '',
      subject: def.subject,
      eventType: def.eventType,
      status: def.status,
      providerMessageId: def.sent ? `seed-msg-${i}` : null,
      attempts: def.attempts,
      lastError: def.error ?? null,
      sentAt: def.sent ? new Date(createdAt.getTime() + 5000) : null,
      eventKey,
      meta: { seed: true },
      createdAt,
      updatedAt: createdAt,
    });
    created += 1;
  }
  console.log(`  email logs: ${created} created (${defs.length - created} already existed)`);
}

async function seedSiteSettings(adminId) {
  const existing = await SiteSettings.findOne({ key: 'default' });
  if (existing?.contact?.companyName) {
    console.log('  site settings: already populated — skipped (delete contact fields to reseed)');
    return;
  }
  const doc = existing ?? new SiteSettings({ key: 'default' });
  doc.contact = {
    companyName: 'SkillBee Learning Pvt. Ltd.',
    email: 'hello@skillbee.example',
    phone: '+91 98765 43210',
    alternatePhone: '+91 98765 43211',
    whatsappNumber: '+91 98765 43210',
    address: '42 Tech Park, MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    postalCode: '560001',
    gstin: '29ABCDE1234F1Z5',
    businessHours: 'Mon–Fri, 9:00–18:00 IST',
  };
  doc.socialLinks = {
    facebook: 'https://facebook.com/skillbee',
    instagram: 'https://instagram.com/skillbee',
    linkedin: 'https://linkedin.com/company/skillbee',
    youtube: 'https://youtube.com/@skillbee',
    twitter: 'https://x.com/skillbee',
    telegram: 'https://t.me/skillbee',
    whatsapp: 'https://wa.me/919876543210',
  };
  doc.updatedBy = adminId ?? null;
  await doc.save();
  console.log('  site settings: populated with seed contact/social data');
}

async function main() {
  await connectDatabase();

  const adminRole = await Role.findOne({ slug: { $in: ['super_admin', 'admin'] }, isActive: true }).select('_id').lean();
  const studentRole = await Role.findOne({ slug: 'student', isActive: true }).select('_id').lean();
  const admin = adminRole ? await User.findOne({ roleId: adminRole._id }).sort({ createdAt: 1 }).select('_id').lean() : null;
  const students = studentRole
    ? await User.find({ roleId: studentRole._id }).sort({ createdAt: 1 }).limit(5).select('_id email').lean()
    : [];
  const anyUsers = students.length ? students : await User.find({}).sort({ createdAt: 1 }).limit(5).select('_id email').lean();

  console.log(`Seeding comms data (admin=${admin?._id ?? 'none'}, recipients=${anyUsers.length})…`);
  await seedNotifications(admin?._id ?? null, students.length ? students : anyUsers);
  await seedEmailLogs(anyUsers);
  await seedSiteSettings(admin?._id ?? null);

  console.log('Done.');
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
