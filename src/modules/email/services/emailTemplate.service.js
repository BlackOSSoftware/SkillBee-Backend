import sanitizeHtml from 'sanitize-html';
import { EmailTemplate } from '../../../models/EmailTemplate.js';
import { AppError } from '../../../utils/AppError.js';
import { slugify } from '../../../utils/slugify.js';

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
]);

const DEFAULT_TEMPLATES = [
  {
    slug: 'welcome',
    name: 'Welcome / Account Created',
    subject: 'Welcome to SkillBee, {{studentName}}',
    htmlBody: '<p>Hi {{studentName}},</p><p>Your SkillBee account ({{email}}) is ready.</p>',
    textBody: 'Hi {{studentName}}, Your SkillBee account ({{email}}) is ready.',
    variables: ['studentName', 'email'],
  },
  {
    slug: 'course_enrollment',
    name: 'Course Enrollment Confirmation',
    subject: 'Enrolled: {{courseName}}',
    htmlBody: '<p>Hi {{studentName}},</p><p>You are enrolled in <strong>{{courseName}}</strong>.</p>',
    textBody: 'Hi {{studentName}}, You are enrolled in {{courseName}}.',
    variables: ['studentName', 'courseName'],
  },
  {
    slug: 'payment_successful',
    name: 'Successful Payment',
    subject: 'Payment confirmed — {{orderId}}',
    htmlBody:
      '<p>Hi {{studentName}},</p><p>Payment of {{amount}} {{currency}} for order {{orderId}} succeeded.</p>',
    textBody: 'Hi {{studentName}}, Payment of {{amount}} {{currency}} for order {{orderId}} succeeded.',
    variables: ['studentName', 'orderId', 'amount', 'currency'],
  },
  {
    slug: 'payment_failed',
    name: 'Failed Payment',
    subject: 'Payment failed — {{orderId}}',
    htmlBody: '<p>Hi {{studentName}},</p><p>Payment for order {{orderId}} failed. Please try again.</p>',
    textBody: 'Hi {{studentName}}, Payment for order {{orderId}} failed. Please try again.',
    variables: ['studentName', 'orderId'],
  },
  {
    slug: 'assignment_submitted',
    name: 'Assignment Submitted',
    subject: 'Assignment submitted: {{assignmentTitle}}',
    htmlBody: '<p>Hi {{studentName}},</p><p>We received your submission for {{assignmentTitle}}.</p>',
    textBody: 'Hi {{studentName}}, We received your submission for {{assignmentTitle}}.',
    variables: ['studentName', 'assignmentTitle'],
  },
  {
    slug: 'assignment_evaluated',
    name: 'Assignment Evaluated',
    subject: 'Assignment graded: {{assignmentTitle}}',
    htmlBody: '<p>Hi {{studentName}},</p><p>Your assignment {{assignmentTitle}} has been evaluated.</p>',
    textBody: 'Hi {{studentName}}, Your assignment {{assignmentTitle}} has been evaluated.',
    variables: ['studentName', 'assignmentTitle', 'score'],
  },
  {
    slug: 'quiz_result',
    name: 'Quiz Result',
    subject: 'Quiz result: {{quizTitle}}',
    htmlBody: '<p>Hi {{studentName}},</p><p>Your result for {{quizTitle}}: {{score}}</p>',
    textBody: 'Hi {{studentName}}, Your result for {{quizTitle}}: {{score}}',
    variables: ['studentName', 'quizTitle', 'score'],
  },
  {
    slug: 'certificate_generated',
    name: 'Certificate Generated',
    subject: 'Certificate ready — {{certificateNumber}}',
    htmlBody:
      '<p>Hi {{studentName}},</p><p>Your certificate {{certificateNumber}} for {{courseName}} is ready.</p>',
    textBody:
      'Hi {{studentName}}, Your certificate {{certificateNumber}} for {{courseName}} is ready.',
    variables: ['studentName', 'certificateNumber', 'courseName'],
  },
  {
    slug: 'course_announcement',
    name: 'Course Announcement',
    subject: '{{title}}',
    htmlBody: '<p>Hi {{studentName}},</p><p>{{message}}</p>',
    textBody: 'Hi {{studentName}}, {{message}}',
    variables: ['studentName', 'title', 'message', 'courseName'],
  },
  {
    slug: 'password_reset',
    name: 'Password Reset',
    subject: 'Reset your SkillBee password',
    htmlBody:
      '<p>Hi {{studentName}},</p><p>Use this link to reset your password: <a href="{{resetLink}}">Reset password</a></p><p>If you did not request this, ignore this email.</p>',
    textBody: 'Hi {{studentName}}, Reset link: {{resetLink}}',
    variables: ['studentName', 'resetLink', 'email'],
  },
  {
    slug: 'custom_admin',
    name: 'Custom Admin Email',
    subject: '{{title}}',
    htmlBody: '<p>Hi {{studentName}},</p><p>{{message}}</p>',
    textBody: 'Hi {{studentName}}, {{message}}',
    variables: ['studentName', 'title', 'message', 'email'],
  },
];

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
