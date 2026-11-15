/**
 * Seed ONE real LIVE_SESSION test course for end-to-end testing of the
 * live application → admin review → conversion workflow.
 *
 * Idempotent: skips creation if a course with the same slug already exists.
 *
 * Usage:
 *   node src/scripts/seedTestLiveCourse.js
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { COURSE_STATUS } from '../config/security.js';
import { Course } from '../models/Course.js';
import { CourseCategory } from '../models/CourseCategory.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';

const SLUG = 'skillbee-live-session-test-batch-2026';

const THUMBNAIL = {
  provider: 'cloudinary',
  publicId: 'skillbee/courses/test-live-batch-2026',
  secureUrl:
    'https://res.cloudinary.com/demo/image/upload/skillbee/courses/test-live-batch-2026.jpg',
  width: 1280,
  height: 720,
  format: 'jpg',
  bytes: 120000,
};

async function main() {
  await connectDatabase();

  const existing = await Course.findOne({ slug: SLUG, deletedAt: null }).lean();
  if (existing) {
    console.log(`Test live course already exists: ${existing._id} (${SLUG})`);
    await disconnectDatabase();
    return;
  }

  // Reuse an existing category; fall back to creating a clearly-marked test one.
  let category = await CourseCategory.findOne({ deletedAt: null }).sort({ createdAt: 1 });
  if (!category) {
    category = await CourseCategory.create({
      name: 'TEST - Live Sessions',
      slug: 'test-live-sessions',
      description: 'Test category for live session course workflow verification',
      status: 'active',
    });
    console.log(`Created category: ${category._id}`);
  } else {
    console.log(`Using category: ${category._id} (${category.name})`);
  }

  // Assign the first available admin/instructor as course instructor.
  const staffRoles = await Role.find({ slug: { $in: ['admin', 'super_admin', 'instructor'] } }).select('_id');
  const instructor = await User.findOne({
    roleId: { $in: staffRoles.map((r) => r._id) },
    deletedAt: null,
    status: 'active',
  }).select('_id');
  const instructorIds = instructor ? [instructor._id] : [];
  console.log(`Instructor assigned: ${instructor?._id?.toString() ?? 'none'}`);

  const course = await Course.create({
    title: 'SkillBee Live Session – TEST Batch 2026',
    slug: SLUG,
    shortDescription:
      'TEST COURSE — verifies the live application and admission workflow. Not a commercial batch.',
    description:
      '<p><strong>TEST COURSE</strong> — A test live-session course to verify the complete SkillBee live application and admission workflow. Do not enroll expecting real training content.</p>',
    thumbnail: THUMBNAIL,
    gallery: [],
    categoryIds: [category._id],
    instructorIds,
    level: 'all_levels',
    language: 'en',
    courseType: 'LIVE_SESSION',
    durationValue: 30,
    durationUnit: 'days',
    status: COURSE_STATUS.PUBLISHED,
    publishedAt: new Date(),
    isFeatured: false,
    tags: ['test', 'live-session', 'do-not-enroll'],
    liveSession: {
      batchName: 'Test Batch November 2026',
      startDate: new Date('2026-11-25T00:00:00.000Z'),
      endDate: new Date('2026-12-25T00:00:00.000Z'),
      sessionMode: 'Live Online',
      sessionSchedule: 'Tue/Thu/Sat 6–8 PM IST',
    },
    enrollment: {
      limitEnabled: true,
      maximumStudents: 25,
      currentStudents: 0,
    },
    pricing: {
      type: 'paid',
      regularPrice: 12000,
      salePrice: null,
      currency: 'INR',
    },
    seo: {
      metaTitle: 'SkillBee Live Session – TEST Batch 2026',
      metaDescription: 'Test live-session course for workflow verification.',
      noIndex: true,
    },
  });

  console.log(`Created test live course: ${course._id}`);
  console.log(`  slug: ${course.slug}`);
  console.log(`  type: ${course.effectiveCourseType()}`);
  console.log(`  status: ${course.status}`);

  await disconnectDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
