import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { NEWSLETTER_STATUS, NewsletterSubscriber } from '../models/NewsletterSubscriber.js';
import { NewsletterCampaign } from '../models/NewsletterCampaign.js';
import { User } from '../models/User.js';

/**
 * Development-only seed for admin Newsletter UI testing.
 * Idempotent: skips subscribers/campaigns that already exist.
 * Records are identifiable by the `seed-newsletter-` email prefix and
 * `seed-` subject prefix and can be removed safely:
 *   NewsletterSubscriber.deleteMany({ email: /^seed-newsletter-/ })
 *   NewsletterCampaign.deleteMany({ subject: /^seed-/ })
 */
if (env.NODE_ENV === 'production') {
  console.error('seedNewsletter is development-only and refuses to run in production.');
  process.exit(1);
}

const SUBSCRIBERS = [
  { email: 'seed-newsletter-aarav@example.com', status: NEWSLETTER_STATUS.SUBSCRIBED, source: 'website-footer' },
  { email: 'seed-newsletter-diya@example.com', status: NEWSLETTER_STATUS.SUBSCRIBED, source: 'course-checkout' },
  { email: 'seed-newsletter-rohan@example.com', status: NEWSLETTER_STATUS.SUBSCRIBED, source: 'website-popup' },
  { email: 'seed-newsletter-ishita@example.com', status: NEWSLETTER_STATUS.PENDING, source: 'website-footer' },
  { email: 'seed-newsletter-kabir@example.com', status: NEWSLETTER_STATUS.PENDING, source: 'referral' },
  { email: 'seed-newsletter-meera@example.com', status: NEWSLETTER_STATUS.UNSUBSCRIBED, source: 'website-footer' },
  { email: 'seed-newsletter-aditya@example.com', status: NEWSLETTER_STATUS.SUBSCRIBED, source: 'webinar' },
  { email: 'seed-newsletter-sara@example.com', status: NEWSLETTER_STATUS.SUBSCRIBED, source: 'course-checkout' },
  { email: 'seed-newsletter-nikhil@example.com', status: NEWSLETTER_STATUS.PENDING, source: 'website-popup' },
  { email: 'seed-newsletter-pooja@example.com', status: NEWSLETTER_STATUS.UNSUBSCRIBED, source: 'website-footer' },
  { email: 'seed-newsletter-sanjay@example.com', status: NEWSLETTER_STATUS.SUBSCRIBED, source: 'webinar' },
  { email: 'seed-newsletter-anjali@example.com', status: NEWSLETTER_STATUS.SUBSCRIBED, source: 'referral' },
];

const CAMPAIGNS = [
  {
    subject: 'seed- Weekly digest: new GMP courses live',
    status: 'sent',
    stats: { queued: 8, sent: 8, failed: 0, skippedUnsubscribed: 2 },
    daysAgo: 21,
  },
  {
    subject: 'seed- Webinar reminder: Data Integrity in Pharma',
    status: 'sent',
    stats: { queued: 8, sent: 7, failed: 1, skippedUnsubscribed: 2 },
    daysAgo: 12,
  },
  {
    subject: 'seed- Festive offer: 20% off all certification tracks',
    status: 'sent',
    stats: { queued: 8, sent: 8, failed: 0, skippedUnsubscribed: 2 },
    daysAgo: 5,
  },
  {
    subject: 'seed- New blog: CSV validation best practices',
    status: 'queued',
    stats: { queued: 0, sent: 0, failed: 0, skippedUnsubscribed: 0 },
    daysAgo: 0,
  },
  {
    subject: 'seed- Draft: Q1 learning report (do not send)',
    status: 'draft',
    stats: { queued: 0, sent: 0, failed: 0, skippedUnsubscribed: 0 },
    daysAgo: 0,
  },
];

const HTML_BODY = `<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
<h1 style="color:#4f46e5">Skillbee Newsletter</h1>
<p>Hi there,</p>
<p>This is a seeded campaign for admin UI testing. It exercises the campaign list, detail drawer and delivery stats.</p>
<p><a href="https://example.com" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">View on Skillbee</a></p>
<p style="color:#666;font-size:12px">You received this because you subscribed at skillbee.example. <a href="https://example.com/unsubscribe">Unsubscribe</a></p>
</body></html>`;

const TEXT_BODY = `Skillbee Newsletter\n\nHi there,\n\nThis is a seeded campaign for admin UI testing.\n\nView on Skillbee: https://example.com\n\nUnsubscribe: https://example.com/unsubscribe`;

async function main() {
  await connectDatabase();

  const admin = await User.findOne({}).sort({ createdAt: 1 }).select('_id');
  if (!admin) {
    console.error('No user found — run the app once so an admin account exists.');
    await disconnectDatabase();
    process.exit(1);
  }

  let subsCreated = 0;
  for (const s of SUBSCRIBERS) {
    const exists = await NewsletterSubscriber.findOne({ email: s.email });
    if (exists) {
      console.log(`  skip subscriber (exists): ${s.email}`);
      continue;
    }
    const subscribed = s.status === NEWSLETTER_STATUS.SUBSCRIBED;
    await NewsletterSubscriber.create({
      email: s.email,
      status: s.status,
      source: s.source,
      subscribedAt: subscribed ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : null,
      unsubscribedAt: s.status === NEWSLETTER_STATUS.UNSUBSCRIBED ? new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) : null,
    });
    subsCreated += 1;
  }

  let campsCreated = 0;
  for (const c of CAMPAIGNS) {
    const exists = await NewsletterCampaign.findOne({ subject: c.subject });
    if (exists) {
      console.log(`  skip campaign (exists): ${c.subject}`);
      continue;
    }
    const createdAt = new Date(Date.now() - c.daysAgo * 24 * 60 * 60 * 1000);
    await NewsletterCampaign.create({
      subject: c.subject,
      htmlBody: HTML_BODY,
      textBody: TEXT_BODY,
      status: c.status,
      createdBy: admin._id,
      stats: c.stats,
      startedAt: c.status === 'draft' ? null : createdAt,
      completedAt: c.status === 'sent' || c.status === 'failed' ? new Date(createdAt.getTime() + 30 * 60 * 1000) : null,
      createdAt,
      updatedAt: createdAt,
    });
    campsCreated += 1;
  }

  console.log(`Seeded ${subsCreated} subscribers and ${campsCreated} campaigns.`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
