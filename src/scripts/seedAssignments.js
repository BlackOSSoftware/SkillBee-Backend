/**
 * Development-only assignment seed for SkillBee Phase 6.
 * Idempotent by slug + isDemoSeed. Does NOT invent WordPress migrations.
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { ASSIGNMENT_STATUS } from '../config/security.js';
import { Assignment } from '../models/Assignment.js';
import { Course } from '../models/Course.js';
import { Permission } from '../models/Permission.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { ensureUniqueAssignmentSlug } from '../modules/assignments/utils/slug.js';

const COURSE_SLUG = 'computerized-system-validation-csv-csa-demo';

const DEFS = [
  {
    title: 'CSV Documentation Package Review',
    slug: 'csv-documentation-package-review-demo',
    instructions:
      'Upload a PDF summary of a sample URS/FS documentation package for a regulated computerized system. Development seed — not a WordPress import.',
    submissionType: 'file_upload',
    maximumMarks: 20,
    allowedFileTypes: ['.pdf', '.docx'],
    status: ASSIGNMENT_STATUS.PUBLISHED,
    allowResubmission: true,
    maxSubmissions: 2,
  },
  {
    title: 'Risk Assessment Narrative',
    slug: 'risk-assessment-narrative-demo',
    instructions:
      'Write a short narrative explaining how you would apply a risk-based approach to a Category 4 configured system. Text only.',
    submissionType: 'text',
    maximumMarks: 15,
    status: ASSIGNMENT_STATUS.PUBLISHED,
    allowLateSubmission: true,
  },
  {
    title: 'ALCOA+ Evidence Portfolio',
    slug: 'alcoa-evidence-portfolio-demo',
    instructions:
      'Submit both a short written reflection and a supporting PDF attachment demonstrating ALCOA+ controls.',
    submissionType: 'file_and_text',
    maximumMarks: 25,
    allowedFileTypes: ['.pdf', '.txt', '.docx'],
    status: ASSIGNMENT_STATUS.PUBLISHED,
    allowResubmission: true,
    maxSubmissions: 3,
  },
  {
    title: 'Draft IQ Protocol Outline',
    slug: 'draft-iq-protocol-outline-demo',
    instructions: 'Draft assignment — not visible to students until published.',
    submissionType: 'text',
    maximumMarks: 10,
    status: ASSIGNMENT_STATUS.DRAFT,
  },
];

async function seed() {
  if (env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    console.error('Refusing to seed assignments in production.');
    process.exit(1);
  }

  await connectDatabase();
  await Permission.ensureDefaults();
  await Role.ensureDefaults();

  const course = await Course.findOne({ slug: COURSE_SLUG, deletedAt: null });
  if (!course) {
    console.error(`Course ${COURSE_SLUG} not found. Run npm run seed:curriculum first.`);
    process.exit(1);
  }

  let admin = await User.findOne({ email: 'admin@skillbee.local' });
  if (!admin) admin = await User.findOne({}).sort({ createdAt: 1 });
  if (!admin) {
    console.error('No user found');
    process.exit(1);
  }

  for (const def of DEFS) {
    let row = await Assignment.findOne({
      courseId: course._id,
      slug: def.slug,
      isDemoSeed: true,
    });
    if (row) {
      console.log(`Exists: ${def.title}`);
      continue;
    }
    const slug = await ensureUniqueAssignmentSlug(Assignment, course._id, def.slug);
    row = await Assignment.create({
      title: def.title,
      slug,
      instructions: def.instructions,
      courseId: course._id,
      dueDate: new Date(Date.now() + 14 * 86400000),
      maximumMarks: def.maximumMarks,
      allowedFileTypes: def.allowedFileTypes || ['.pdf', '.txt'],
      maximumFileSizeBytes: 5 * 1024 * 1024,
      submissionType: def.submissionType,
      allowLateSubmission: Boolean(def.allowLateSubmission),
      allowResubmission: Boolean(def.allowResubmission),
      maxSubmissions: def.maxSubmissions || 1,
      status: def.status,
      publishedAt: def.status === ASSIGNMENT_STATUS.PUBLISHED ? new Date() : null,
      createdBy: admin._id,
      updatedBy: admin._id,
      isDemoSeed: true,
    });
    console.log(`Created: ${row.title} (${row.status})`);
  }

  console.log('Assignment seed complete (development demo only).');
  await disconnectDatabase();
}

seed().catch(async (err) => {
  console.error(err);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
