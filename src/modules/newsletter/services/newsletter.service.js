import crypto from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { env } from '../../../config/env.js';
import {
  NEWSLETTER_STATUS,
  NewsletterSubscriber,
} from '../../../models/NewsletterSubscriber.js';
import {
  CAMPAIGN_STATUS,
  NewsletterCampaign,
} from '../../../models/NewsletterCampaign.js';
import { enqueueEmail } from '../../email/services/emailQueue.service.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

export function makeUnsubscribeToken(email) {
  return crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(`newsletter:unsub:${String(email).toLowerCase()}`)
    .digest('hex');
}

function publicMessage() {
  return {
    message: 'If this email can be subscribed, a verification link has been sent.',
  };
}

export async function subscribe(email, source = 'website') {
  const normalized = String(email).toLowerCase().trim();
  let sub = await NewsletterSubscriber.findOne({ email: normalized, deletedAt: null }).select(
    '+verificationTokenHash +unsubscribeTokenHash'
  );

  const rawVerify = crypto.randomBytes(32).toString('hex');
  const rawUnsub = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 48 * 60 * 60 * 1000);

  if (!sub) {
    sub = await NewsletterSubscriber.create({
      email: normalized,
      status: NEWSLETTER_STATUS.PENDING,
      verificationTokenHash: hashToken(rawVerify),
      verificationExpiresAt: expires,
      unsubscribeTokenHash: hashToken(rawUnsub),
      source: String(source || 'website').slice(0, 80),
    });
  } else if (sub.status === NEWSLETTER_STATUS.SUBSCRIBED) {
    return publicMessage();
  } else {
    sub.status = NEWSLETTER_STATUS.PENDING;
    sub.verificationTokenHash = hashToken(rawVerify);
    sub.verificationExpiresAt = expires;
    sub.unsubscribeTokenHash = hashToken(rawUnsub);
    sub.unsubscribedAt = null;
    await sub.save();
  }

  const base = (env.EMAIL_FRONTEND_URL || env.FRONTEND_BASE_URL || '').replace(/\/$/, '');
  const verifyUrl = `${base}/newsletter/verify?token=${rawVerify}&email=${encodeURIComponent(normalized)}`;

  await enqueueEmail({
    to: normalized,
    templateSlug: 'custom_admin',
    eventType: 'newsletter.verify',
    eventKey: `newsletter.verify:${sub._id}:${rawVerify.slice(0, 12)}`,
    variables: {
      studentName: 'Subscriber',
      email: normalized,
      title: 'Confirm your SkillBee newsletter subscription',
      message: `Please verify your subscription: ${verifyUrl}`,
      resetLink: verifyUrl,
    },
  });

  return publicMessage();
}

export async function verify(email, token) {
  const normalized = String(email || '').toLowerCase().trim();
  const sub = await NewsletterSubscriber.findOne({
    email: normalized,
    deletedAt: null,
  }).select('+verificationTokenHash +unsubscribeTokenHash');

  // Always generic success/failure messaging to avoid enumeration
  if (
    !sub ||
    !sub.verificationTokenHash ||
    sub.verificationTokenHash !== hashToken(token) ||
    !sub.verificationExpiresAt ||
    sub.verificationExpiresAt < new Date()
  ) {
    throw new AppError('Invalid or expired verification link', 400, 'INVALID_TOKEN');
  }

  sub.status = NEWSLETTER_STATUS.SUBSCRIBED;
  sub.subscribedAt = new Date();
  sub.verificationTokenHash = null;
  sub.verificationExpiresAt = null;
  await sub.save();
  return { message: 'Subscription verified successfully' };
}

export async function unsubscribe({ email, token }) {
  const normalized = String(email || '').toLowerCase().trim();
  const sub = await NewsletterSubscriber.findOne({
    email: normalized,
    deletedAt: null,
  }).select('+unsubscribeTokenHash');

  const hmacOk = token && token === makeUnsubscribeToken(normalized);
  const hashOk =
    sub?.unsubscribeTokenHash && sub.unsubscribeTokenHash === hashToken(token);

  if (!sub || (!hmacOk && !hashOk)) {
    return { message: 'If subscribed, you have been unsubscribed.' };
  }

  sub.status = NEWSLETTER_STATUS.UNSUBSCRIBED;
  sub.unsubscribedAt = new Date();
  await sub.save();
  return { message: 'If subscribed, you have been unsubscribed.' };
}

export async function listSubscribers(query) {
  const filter = { deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.search) {
    filter.email = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    NewsletterSubscriber.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    NewsletterSubscriber.countDocuments(filter),
  ]);
  return {
    data: rows.map((r) => NewsletterSubscriber.hydrate(r).toSafeObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getSubscriber(id) {
  const doc = await NewsletterSubscriber.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Subscriber not found', 404, 'SUBSCRIBER_NOT_FOUND');
  return doc.toSafeObject();
}

export async function setSubscriberStatus(id, status) {
  const doc = await NewsletterSubscriber.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Subscriber not found', 404, 'SUBSCRIBER_NOT_FOUND');
  doc.status = status;
  if (status === NEWSLETTER_STATUS.UNSUBSCRIBED) doc.unsubscribedAt = new Date();
  if (status === NEWSLETTER_STATUS.SUBSCRIBED) {
    doc.subscribedAt = doc.subscribedAt || new Date();
    doc.unsubscribedAt = null;
  }
  await doc.save();
  return doc.toSafeObject();
}

export async function deleteSubscriber(id) {
  const doc = await NewsletterSubscriber.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Subscriber not found', 404, 'SUBSCRIBER_NOT_FOUND');
  doc.deletedAt = new Date();
  doc.status = NEWSLETTER_STATUS.UNSUBSCRIBED;
  await doc.save();
  return doc.toSafeObject();
}

export async function createAndSendCampaign(req, input) {
  const subject = sanitizeHtml(String(input.subject || ''), {
    allowedTags: [],
    allowedAttributes: {},
  }).slice(0, 200);
  const htmlBody = String(input.htmlBody || '').slice(0, 100000);
  const textBody = String(input.textBody || '').slice(0, 50000);

  const campaign = await NewsletterCampaign.create({
    subject,
    htmlBody,
    textBody,
    status: CAMPAIGN_STATUS.QUEUED,
    createdBy: req.user._id,
    startedAt: new Date(),
    deliveredEmails: [],
  });

  setImmediate(async () => {
    try {
      campaign.status = CAMPAIGN_STATUS.SENDING;
      await campaign.save();

      const cursor = NewsletterSubscriber.find({
        status: NEWSLETTER_STATUS.SUBSCRIBED,
        deletedAt: null,
      })
        .select('+unsubscribeTokenHash email')
        .lean()
        .cursor();

      const base = (env.EMAIL_FRONTEND_URL || env.FRONTEND_BASE_URL || '').replace(/\/$/, '');
      let queued = 0;
      let sent = 0;
      let failed = 0;

      for await (const sub of cursor) {
        const email = sub.email;
        // Duplicate prevention within campaign
        const already = await NewsletterCampaign.findOne({
          _id: campaign._id,
          deliveredEmails: email,
        }).select('_id');
        if (already) continue;

        await NewsletterCampaign.updateOne(
          { _id: campaign._id },
          { $addToSet: { deliveredEmails: email }, $inc: { 'stats.queued': 1 } }
        );
        queued += 1;

        const unsubUrl = `${base}/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${makeUnsubscribeToken(email)}`;

        try {
          const result = await enqueueEmail({
            to: email,
            templateSlug: 'custom_admin',
            eventType: 'newsletter.campaign',
            eventKey: `newsletter.campaign:${campaign._id}:${email}`,
            variables: {
              studentName: 'Subscriber',
              email,
              title: subject,
              message: `${textBody}\n\nUnsubscribe: ${unsubUrl}`,
            },
          });
          if (result.duplicate) {
            // already counted
          } else if (result.queued) {
            sent += 1;
            await NewsletterCampaign.updateOne(
              { _id: campaign._id },
              { $inc: { 'stats.sent': 1 } }
            );
          }
        } catch {
          failed += 1;
          await NewsletterCampaign.updateOne(
            { _id: campaign._id },
            { $inc: { 'stats.failed': 1 } }
          );
        }
      }

      await NewsletterCampaign.updateOne(
        { _id: campaign._id },
        {
          $set: {
            status: CAMPAIGN_STATUS.SENT,
            completedAt: new Date(),
            'stats.queued': queued,
            'stats.sent': sent,
            'stats.failed': failed,
          },
        }
      );
    } catch {
      await NewsletterCampaign.updateOne(
        { _id: campaign._id },
        { $set: { status: CAMPAIGN_STATUS.FAILED, completedAt: new Date() } }
      );
    }
  });

  return campaign.toSafeObject();
}

export async function listCampaigns(query) {
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    NewsletterCampaign.find().sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    NewsletterCampaign.countDocuments(),
  ]);
  return {
    data: rows.map((r) => NewsletterCampaign.hydrate(r).toSafeObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function getCampaign(id) {
  const doc = await NewsletterCampaign.findById(id);
  if (!doc) throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
  return doc.toSafeObject();
}
