/**
 * Development-only seed: enrollment + lesson progress for demo course.
 * Does NOT invent WordPress migration records.
 *
 * Expected primary student:
 * - 10 required lessons, 7 completed → 70%, in_progress
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { ROLE_SLUGS } from '../config/security.js';
import { Course } from '../models/Course.js';
import { CourseEnrollment } from '../models/CourseEnrollment.js';
import { CourseLesson } from '../models/CourseLesson.js';
import { CourseTopic } from '../models/CourseTopic.js';
import { LessonProgress } from '../models/LessonProgress.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { Permission } from '../models/Permission.js';
import { recalculateEnrollmentProgress } from '../modules/enrollment/services/progress.service.js';

const DEMO_COURSE_SLUG = process.env.SEED_ENROLLMENT_COURSE_SLUG || 'csv-csa-demo';

async function ensureStudent(email) {
  let user = await User.findOne({ email, deletedAt: null });
  if (!user) {
    const role = await Role.findBySlug(ROLE_SLUGS.STUDENT);
    user = new User({
      firstName: email.split('@')[0],
      lastName: 'Seed',
      email,
      roleId: role._id,
      emailVerified: true,
    });
    await user.setPassword('ChangeMe123');
    await user.save();
  }
  return user;
}

async function main() {
  if (env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    console.error('Refusing to seed enrollments in production without SEED_ALLOW_PRODUCTION=true');
    process.exit(1);
  }

  await connectDatabase();
  await Permission.ensureDefaults();
  await Role.ensureDefaults();

  const course = await Course.findOne({ slug: DEMO_COURSE_SLUG, deletedAt: null });
  if (!course) {
    console.error(
      `Course slug "${DEMO_COURSE_SLUG}" not found. Run seed:curriculum first or set SEED_ENROLLMENT_COURSE_SLUG.`
    );
    process.exit(1);
  }

  let lessons = await CourseLesson.find({
    courseId: course._id,
    deletedAt: null,
    status: 'published',
  }).sort({ sortOrder: 1 });

  if (lessons.length < 10) {
    console.log('Ensuring demo topic with 10 required + 1 optional lessons…');
    let topic = await CourseTopic.findOne({ courseId: course._id, deletedAt: null });
    if (!topic) {
      topic = await CourseTopic.create({
        courseId: course._id,
        title: 'Enrollment Seed Topic',
        slug: 'enrollment-seed-topic',
        description: 'Phase 7 seed',
        sortOrder: 0,
        status: 'published',
        isRequired: true,
      });
    }
    const existingCount = lessons.length;
    for (let i = existingCount; i < 10; i += 1) {
      await CourseLesson.create({
        courseId: course._id,
        topicId: topic._id,
        title: `Seed Required Lesson ${i + 1}`,
        slug: `seed-required-lesson-${i + 1}`,
        type: 'text',
        content: { textContent: { body: `<p>Seed ${i + 1}</p>`, format: 'html' } },
        isRequired: true,
        status: 'published',
        sortOrder: i,
      });
    }
    const optionalExists = await CourseLesson.exists({
      courseId: course._id,
      slug: 'seed-optional-bonus',
      deletedAt: null,
    });
    if (!optionalExists) {
      await CourseLesson.create({
        courseId: course._id,
        topicId: topic._id,
        title: 'Seed Optional Bonus',
        slug: 'seed-optional-bonus',
        type: 'text',
        content: { textContent: { body: '<p>optional</p>', format: 'html' } },
        isRequired: false,
        status: 'published',
        sortOrder: 99,
      });
    }
    lessons = await CourseLesson.find({
      courseId: course._id,
      deletedAt: null,
      status: 'published',
      isRequired: true,
    }).sort({ sortOrder: 1 });
  }

  const required = lessons.filter((l) => l.isRequired).slice(0, 10);
  const progressStudent = await ensureStudent('student.progress@skillbee.local');
  const completedStudent = await ensureStudent('student.completed@skillbee.local');
  const revokedStudent = await ensureStudent('student.revoked@skillbee.local');

  async function upsertEnrollment(student, status, completeCount = 0) {
    let enrollment = await CourseEnrollment.findOne({
      courseId: course._id,
      studentId: student._id,
      deletedAt: null,
    });
    if (!enrollment) {
      enrollment = new CourseEnrollment({
        courseId: course._id,
        studentId: student._id,
        status: status === 'revoked' ? 'revoked' : 'active',
        enrollmentType: 'admin_granted',
        source: 'admin_granted',
        enrolledAt: new Date(),
      });
      enrollment.pushHistory({
        action: 'created',
        toStatus: enrollment.status,
        reason: 'seed:enrollment',
      });
      if (status === 'revoked') {
        enrollment.revokedAt = new Date();
        enrollment.revocationReason = 'Seed revoked enrollment';
        enrollment.pushHistory({
          action: 'revoked',
          fromStatus: 'active',
          toStatus: 'revoked',
          reason: 'Seed revoked enrollment',
        });
      }
      await enrollment.save();
    }

    await LessonProgress.deleteMany({ enrollmentId: enrollment._id });
    for (let i = 0; i < completeCount; i += 1) {
      const lesson = required[i];
      if (!lesson) break;
      await LessonProgress.create({
        studentId: student._id,
        courseId: course._id,
        lessonId: lesson._id,
        enrollmentId: enrollment._id,
        completionStatus: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
        lastAccessedAt: new Date(),
        completionSource: 'system',
      });
    }

    if (status !== 'revoked') {
      await recalculateEnrollmentProgress(enrollment._id);
    }
    return CourseEnrollment.findById(enrollment._id);
  }

  const e1 = await upsertEnrollment(progressStudent, 'active', 7);
  const e2 = await upsertEnrollment(completedStudent, 'active', required.length);
  const e3 = await upsertEnrollment(revokedStudent, 'revoked', 2);

  console.log('Seed enrollment complete');
  console.log({
    course: course.slug,
    progressStudent: {
      email: progressStudent.email,
      progressPercentage: e1.progressPercentage,
      completed: e1.completedLessonsCount,
      totalRequired: e1.totalRequiredLessons,
      status: e1.courseCompletionStatus,
    },
    completedStudent: {
      email: completedStudent.email,
      progressPercentage: e2.progressPercentage,
      status: e2.courseCompletionStatus,
    },
    revokedStudent: {
      email: revokedStudent.email,
      enrollmentStatus: e3.status,
    },
  });

  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
