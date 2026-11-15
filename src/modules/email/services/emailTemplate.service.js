import sanitizeHtml from 'sanitize-html';
import { EmailTemplate } from '../../../models/EmailTemplate.js';
import { AppError } from '../../../utils/AppError.js';
import { slugify } from '../../../utils/slugify.js';
import { DEFAULT_TEMPLATES, EMAIL_DESIGN_VERSION } from './defaultTemplates.js';

export const ALLOWED_TEMPLATE_VARS = Object.freeze([
  'studentName',
  'email',
  'courseName',
  'orderId',
  'amount',
  'currency',
  'certificateNumber',
  'resetLink',
  'message',
  'title',
  'score',
  'assignmentTitle',
  'quizTitle',
  'ticketNumber',
  'enquiryNumber',
  'previousStatus',
  'newStatus',
  'applicationNumber',
]);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderTemplate(template, variables = {}) {
  const allowed = new Set(template.variables?.length ? template.variables : ALLOWED_TEMPLATE_VARS);
  const safe = {};
  for (const [k, v] of Object.entries(variables || {})) {
    if (!allowed.has(k) && !ALLOWED_TEMPLATE_VARS.includes(k)) continue;
    safe[k] = escapeHtml(v);
  }

  const replace = (body) =>
    String(body || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
      if (!ALLOWED_TEMPLATE_VARS.includes(key) && !allowed.has(key)) return '';
      return safe[key] != null ? safe[key] : '';
    });

  return {
    subject: replace(template.subject).slice(0, 200),
    html: replace(template.htmlBody),
    text: replace(template.textBody),
  };
}

export async function ensureDefaultTemplates() {
  for (const t of DEFAULT_TEMPLATES) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await EmailTemplate.updateOne(
        { slug: t.slug },
        {
          $setOnInsert: {
            ...t,
            isSystem: true,
            isActive: true,
          },
        },
        { upsert: true }
      );
      // Upgrade built-in designs: only system templates still on an older
      // designVersion are refreshed. Custom templates (isSystem=false) and
      // templates already on the current version are never touched.
      // eslint-disable-next-line no-await-in-loop
      await EmailTemplate.updateOne(
        {
          slug: t.slug,
          isSystem: true,
          $or: [{ designVersion: { $lt: EMAIL_DESIGN_VERSION } }, { designVersion: { $exists: false } }],
        },
        {
          $set: {
            name: t.name,
            subject: t.subject,
            htmlBody: t.htmlBody,
            textBody: t.textBody,
            variables: t.variables,
            designVersion: EMAIL_DESIGN_VERSION,
          },
        }
      );
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
}

export async function listTemplates() {
  await ensureDefaultTemplates();
  const rows = await EmailTemplate.find().sort({ name: 1 }).lean();
  return rows.map((r) => EmailTemplate.hydrate(r).toSafeObject());
}

export async function getTemplate(id) {
  await ensureDefaultTemplates();
  let doc = null;
  if (/^[a-f\d]{24}$/i.test(id)) doc = await EmailTemplate.findById(id);
  if (!doc) doc = await EmailTemplate.findOne({ slug: id });
  if (!doc) throw new AppError('Email template not found', 404, 'TEMPLATE_NOT_FOUND');
  return doc;
}

export async function createTemplate(input) {
  const slug = slugify(input.slug || input.name).replace(/_/g, '-');
  if (!slug) throw new AppError('Invalid slug', 400, 'INVALID_SLUG');
  const variables = (input.variables || []).filter((v) => ALLOWED_TEMPLATE_VARS.includes(v));
  try {
    const doc = await EmailTemplate.create({
      name: sanitizeHtml(input.name, { allowedTags: [], allowedAttributes: {} }).slice(0, 120),
      slug,
      subject: String(input.subject).slice(0, 200),
      htmlBody: String(input.htmlBody).slice(0, 50000),
      textBody: String(input.textBody).slice(0, 20000),
      variables,
      isActive: input.isActive !== false,
      isSystem: false,
    });
    return doc.toSafeObject();
  } catch (err) {
    if (err?.code === 11000) throw new AppError('Template slug exists', 409, 'DUPLICATE_SLUG');
    throw err;
  }
}

export async function updateTemplate(id, input) {
  const doc = await getTemplate(id);
  if (input.name !== undefined) {
    doc.name = sanitizeHtml(input.name, { allowedTags: [], allowedAttributes: {} }).slice(0, 120);
  }
  if (input.subject !== undefined) doc.subject = String(input.subject).slice(0, 200);
  if (input.htmlBody !== undefined) doc.htmlBody = String(input.htmlBody).slice(0, 50000);
  if (input.textBody !== undefined) doc.textBody = String(input.textBody).slice(0, 20000);
  if (input.variables !== undefined) {
    doc.variables = input.variables.filter((v) => ALLOWED_TEMPLATE_VARS.includes(v));
  }
  await doc.save();
  return doc.toSafeObject();
}

export async function setTemplateStatus(id, isActive) {
  const doc = await getTemplate(id);
  doc.isActive = Boolean(isActive);
  await doc.save();
  return doc.toSafeObject();
}

export async function getActiveTemplateBySlug(slug) {
  await ensureDefaultTemplates();
  return EmailTemplate.findOne({ slug, isActive: true });
}
