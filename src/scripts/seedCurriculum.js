/**
 * Development/demo curriculum seed for SkillBee Phase 3.
 * Creates a CSV/CSA sample course with topics and lessons.
 * Idempotent by course slug. Does NOT invent enrollments or payments.
 * Refuses to run in production unless SEED_ALLOW_PRODUCTION=true.
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { COURSE_STATUS, ROLE_SLUGS } from '../config/security.js';
import { Course } from '../models/Course.js';
import { CourseCategory } from '../models/CourseCategory.js';
import { CourseLesson } from '../models/CourseLesson.js';
import { CourseTopic } from '../models/CourseTopic.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { Permission } from '../models/Permission.js';
import { ensureUniqueLessonSlug } from '../modules/courses/services/courseSlug.service.js';

const COURSE_SLUG = 'computerized-system-validation-csv-csa-demo';

const TOPICS = [
  {
    title: 'Introduction to Computerized System Validation',
    description:
      'Fundamental concepts of CSV and regulated computerized systems. Development demo content — not a WordPress import.',
    lessons: [
      {
        title: 'Introduction to CSV',
        type: 'text',
        durationSeconds: 900,
        textContent: {
          body: '<p>Overview of Computerized System Validation in regulated industries.</p>',
          format: 'html',
        },
        isPreview: true,
        status: 'published',
      },
      {
        title: 'Regulated Systems Landscape',
        type: 'text',
        durationSeconds: 720,
        textContent: {
          body: '<p>Where CSV fits within GxP and quality systems.</p>',
          format: 'html',
        },
        status: 'published',
      },
    ],
  },
  {
    title: 'GAMP 5 and Risk-Based Validation',
    description: 'GAMP 5 categories and scalable validation approaches.',
    lessons: [
      {
        title: 'Understanding GAMP 5',
        type: 'video',
        durationSeconds: 1800,
        video: {
          source: 'external',
          provider: 'youtube',
          externalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
        status: 'published',
      },
      {
        title: 'Risk Assessment Fundamentals',
        type: 'text',
        durationSeconds: 1200,
        textContent: {
          body: '<p>Risk-based thinking for computerized systems.</p>',
          format: 'html',
        },
        status: 'published',
      },
    ],
  },
  {
    title: 'Validation Documentation',
    description: 'Core document set used across CSV projects.',
    lessons: [
      {
        title: 'User Requirement Specification',
        type: 'text',
        durationSeconds: 1500,
        textContent: { body: '<p>Writing effective URS content.</p>', format: 'html' },
        status: 'published',
      },
      {
        title: 'Functional Specification',
        type: 'text',
        durationSeconds: 1500,
        textContent: { body: '<p>Translating URS into FS.</p>', format: 'html' },
        status: 'draft',
      },
    ],
  },
  {
    title: 'Testing and Qualification',
    description: 'IQ, OQ and PQ concepts with demo schedules.',
    lessons: [
      {
        title: 'Installation Qualification',
        type: 'text',
        durationSeconds: 1100,
        textContent: { body: '<p>IQ protocol essentials.</p>', format: 'html' },
        status: 'published',
      },
      {
        title: 'Operational Qualification',
        type: 'text',
        durationSeconds: 1100,
        textContent: { body: '<p>OQ testing approaches.</p>', format: 'html' },
        status: 'published',
      },
      {
        title: 'Performance Qualification',
        type: 'live',
        durationSeconds: 3600,
        liveSession: {
          meetingProvider: 'Google Meet',
          meetingUrl: 'https://meet.google.com/example-placeholder',
          startsAt: new Date('2026-12-01T10:00:00Z'),
          endsAt: new Date('2026-12-01T11:00:00Z'),
          timezone: 'Asia/Kolkata',
          instructions: 'Demo live session — not a production meeting.',
        },
        scheduledAt: new Date('2026-12-01T10:00:00Z'),
        status: 'published',
      },
    ],
  },
  {
    title: 'Data Integrity and Compliance',
    description: 'ALCOA+ and inspection readiness themes.',
    lessons: [
      {
        title: 'ALCOA+ Data Integrity Principles',
        type: 'text',
        durationSeconds: 1400,
        textContent: {
          body: '<p>Attributable, Legible, Contemporaneous, Original, Accurate — and the plus.</p>',
          format: 'html',
        },
        isPreview: true,
        status: 'published',
      },
      {
        title: 'CSV Documentation Review',
        type: 'resource',
        durationSeconds: 600,
        resourceContent: { instructions: 'Attach syllabus PDFs via admin attachment APIs.' },
        status: 'draft',
      },
    ],
  },
];

async function main() {
  if (env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    console.error('Refusing curriculum seed in production. Set SEED_ALLOW_PRODUCTION=true to override.');
    process.exit(1);
  }

  await connectDatabase();
  await Permission.ensureDefaults();
  await Role.ensureDefaults();

  let category = await CourseCategory.findOne({ slug: 'csv-csa-demo' });
  if (!category) {
    category = await CourseCategory.create({
      name: 'CSV / CSA (Demo)',
      slug: 'csv-csa-demo',
      description: 'Development category for Phase 3 curriculum demos',
      status: 'active',
    });
  }

  let instructor = await User.findOne({ email: 'instructor.demo@skillbee.local', deletedAt: null });
  if (!instructor) {
    const role = await Role.findBySlug(ROLE_SLUGS.INSTRUCTOR);
    instructor = new User({
      firstName: 'Demo',
      lastName: 'Instructor',
      email: 'instructor.demo@skillbee.local',
      roleId: role._id,
      status: 'active',
      emailVerified: true,
    });
    await instructor.setPassword(process.env.SEED_DEMO_PASSWORD || 'DemoInstructor123');
    await instructor.save();
  }

  let course = await Course.findOne({ slug: COURSE_SLUG, deletedAt: null });
  if (course) {
    console.log(`Demo course already exists: ${course.slug} (${course._id})`);
  } else {
    course = await Course.create({
      title: 'Computerized System Validation (CSV/CSA) — Demo',
      slug: COURSE_SLUG,
      shortDescription: 'Development demo curriculum for SkillBee Phase 3 APIs.',
      description:
        '<p><strong>Development/demo data.</strong> Realistic SkillBee-style CSV training structure. Not imported from WordPress.</p>',
      thumbnail: {
        publicId: 'skillbee/demo/csv-thumb',
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/demo/csv-thumb.jpg',
        width: 1280,
        height: 720,
        format: 'jpg',
        bytes: 1,
      },
      categoryIds: [category._id],
      instructorIds: [instructor._id],
      level: 'intermediate',
      language: 'en',
      pricing: { type: 'paid', regularPrice: 14999, salePrice: 9999, currency: 'INR' },
      learningObjectives: [
        { title: 'Explain CSV fundamentals', description: 'Core terminology and lifecycle' },
        { title: 'Apply GAMP 5 thinking', description: 'Risk-based validation' },
      ],
      requirements: ['Basic GxP awareness'],
      tags: ['csv', 'gamp5', 'demo'],
      status: COURSE_STATUS.DRAFT,
      createdBy: instructor._id,
      updatedBy: instructor._id,
      legacy: { sourcePlatform: 'native' },
    });
    console.log(`Created demo course: ${course.slug} (${course._id})`);
  }

  const existingTopics = await CourseTopic.countDocuments({ courseId: course._id, deletedAt: null });
  if (existingTopics > 0) {
    console.log(`Topics already present (${existingTopics}). Skipping lesson seed (idempotent).`);
  } else {
    for (let ti = 0; ti < TOPICS.length; ti += 1) {
      const topicDef = TOPICS[ti];
      const topic = await CourseTopic.create({
        courseId: course._id,
        title: topicDef.title,
        description: topicDef.description,
        sortOrder: ti,
        availabilityType: 'immediate',
        status: 'published',
        isRequired: true,
        createdBy: instructor._id,
        updatedBy: instructor._id,
      });

      for (let li = 0; li < topicDef.lessons.length; li += 1) {
        const lessonDef = topicDef.lessons[li];
        const slug = await ensureUniqueLessonSlug(course._id, lessonDef.title);
        await CourseLesson.create({
          courseId: course._id,
          topicId: topic._id,
          title: lessonDef.title,
          slug,
          description: lessonDef.description || '',
          type: lessonDef.type,
          content: {
            textContent: lessonDef.textContent || { body: '', format: 'html' },
            video: lessonDef.video
              ? {
                  source: 'external',
                  provider: lessonDef.video.provider || 'youtube',
                  externalUrl: lessonDef.video.externalUrl,
                  processingStatus: 'ready',
                }
              : null,
            liveSession: lessonDef.liveSession || null,
            resourceContent: lessonDef.resourceContent || null,
          },
          durationSeconds: lessonDef.durationSeconds || 0,
          isPreview: Boolean(lessonDef.isPreview),
          isRequired: true,
          sortOrder: li,
          scheduledAt: lessonDef.scheduledAt || null,
          status: lessonDef.status || 'draft',
          createdBy: instructor._id,
          updatedBy: instructor._id,
        });
      }
      console.log(`  Topic: ${topic.title} (${topicDef.lessons.length} lessons)`);
    }
  }

  console.log('Curriculum seed complete (development/demo only).');
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
