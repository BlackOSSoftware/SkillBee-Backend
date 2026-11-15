import { env } from './env.js';

export const security = {
  accessToken: {
    secret: env.JWT_ACCESS_SECRET,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  },
  refreshToken: {
    secret: env.JWT_REFRESH_SECRET,
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  cookie: {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.NODE_ENV === 'production',
    sameSite:
      env.COOKIE_SAME_SITE ?? (env.NODE_ENV === 'production' ? 'strict' : 'lax'),
    path: '/',
  },
  bcryptRounds: 12,
  passwordResetExpiresMinutes: env.PASSWORD_RESET_EXPIRES_MINUTES,
};

export const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
});

export const ROLE_SLUGS = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  INSTRUCTOR: 'instructor',
  STUDENT: 'student',
});

export const PERMISSIONS = Object.freeze({
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',
  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',
  ROLES_DELETE: 'roles:delete',
  PERMISSIONS_READ: 'permissions:read',
  PERMISSIONS_ASSIGN: 'permissions:assign',

  COURSES_READ: 'courses.read',
  COURSES_CREATE: 'courses.create',
  COURSES_UPDATE: 'courses.update',
  COURSES_DELETE: 'courses.delete',
  COURSES_PUBLISH: 'courses.publish',
  COURSES_DUPLICATE: 'courses.duplicate',
  COURSES_ANALYTICS_READ: 'courses.analytics.read',
  COURSES_INSTRUCTORS_MANAGE: 'courses.instructors.manage',
  COURSES_PRICING_MANAGE: 'courses.pricing.manage',
  COURSES_CURRICULUM_MANAGE: 'courses.curriculum.manage',
  COURSES_CURRICULUM_READ: 'courses.curriculum.read',
  COURSES_CURRICULUM_CREATE: 'courses.curriculum.create',
  COURSES_CURRICULUM_UPDATE: 'courses.curriculum.update',
  COURSES_CURRICULUM_DELETE: 'courses.curriculum.delete',
  COURSES_CURRICULUM_REORDER: 'courses.curriculum.reorder',
  COURSES_LESSONS_READ: 'courses.lessons.read',
  COURSES_LESSONS_CREATE: 'courses.lessons.create',
  COURSES_LESSONS_UPDATE: 'courses.lessons.update',
  COURSES_LESSONS_DELETE: 'courses.lessons.delete',
  COURSES_LESSONS_PUBLISH: 'courses.lessons.publish',
  COURSES_LESSONS_REORDER: 'courses.lessons.reorder',
  COURSES_MEDIA_UPLOAD: 'courses.media.upload',
  COURSES_MEDIA_DELETE: 'courses.media.delete',
  COURSES_ATTACHMENTS_MANAGE: 'courses.attachments.manage',
  COURSES_RESOURCES_MANAGE: 'courses.resources.manage',
  COURSES_REVIEWS_MANAGE: 'courses.reviews.manage',
  COURSES_QA_MANAGE: 'courses.qa.manage',
  SEO_MANAGE: 'seo.manage',
  CATEGORIES_MANAGE: 'categories.manage',

  INSTRUCTOR_COURSES_READ: 'instructor.courses.read',
  INSTRUCTOR_COURSES_UPDATE: 'instructor.courses.update',
  INSTRUCTOR_CURRICULUM_MANAGE: 'instructor.curriculum.manage',
  INSTRUCTOR_RESOURCES_MANAGE: 'instructor.resources.manage',
  INSTRUCTOR_STUDENTS_READ: 'instructor.students.read',
  INSTRUCTOR_REVIEWS_READ: 'instructor.reviews.read',

  MEDIA_READ: 'media.read',
  MEDIA_UPLOAD: 'media.upload',
  MEDIA_UPDATE: 'media.update',
  MEDIA_DELETE: 'media.delete',
  MEDIA_RESTORE: 'media.restore',
  MEDIA_STORAGE_READ: 'media.storage.read',
  MEDIA_REFERENCES_READ: 'media.references.read',
  MEDIA_VIDEO_PLAYBACK: 'media.video.playback',

  QUIZZES_READ: 'quizzes.read',
  QUIZZES_CREATE: 'quizzes.create',
  QUIZZES_UPDATE: 'quizzes.update',
  QUIZZES_DELETE: 'quizzes.delete',
  QUIZZES_PUBLISH: 'quizzes.publish',
  QUIZZES_QUESTIONS_MANAGE: 'quizzes.questions.manage',
  QUIZZES_QUESTION_BANK_MANAGE: 'quizzes.question-bank.manage',
  QUIZZES_ATTEMPTS_READ: 'quizzes.attempts.read',
  QUIZZES_RESULTS_READ: 'quizzes.results.read',
  QUIZZES_GRADE: 'quizzes.grade',
  QUIZZES_ANALYTICS_READ: 'quizzes.analytics.read',

  ASSIGNMENTS_READ: 'assignments.read',
  ASSIGNMENTS_CREATE: 'assignments.create',
  ASSIGNMENTS_UPDATE: 'assignments.update',
  ASSIGNMENTS_DELETE: 'assignments.delete',
  ASSIGNMENTS_PUBLISH: 'assignments.publish',
  ASSIGNMENTS_SUBMISSIONS_READ: 'assignments.submissions.read',
  ASSIGNMENTS_GRADE: 'assignments.grade',

  ENQUIRIES_READ: 'enquiries.read',
  ENQUIRIES_MANAGE: 'enquiries.manage',
});

export const MEDIA_PERMISSIONS = [
  'media.read',
  'media.upload',
  'media.update',
  'media.delete',
  'media.restore',
  'media.storage.read',
  'media.references.read',
  'media.video.playback',
];

const ADMIN_CURRICULUM_PERMISSIONS = [
  PERMISSIONS.COURSES_CURRICULUM_MANAGE,
  PERMISSIONS.COURSES_CURRICULUM_READ,
  PERMISSIONS.COURSES_CURRICULUM_CREATE,
  PERMISSIONS.COURSES_CURRICULUM_UPDATE,
  PERMISSIONS.COURSES_CURRICULUM_DELETE,
  PERMISSIONS.COURSES_CURRICULUM_REORDER,
  PERMISSIONS.COURSES_LESSONS_READ,
  PERMISSIONS.COURSES_LESSONS_CREATE,
  PERMISSIONS.COURSES_LESSONS_UPDATE,
  PERMISSIONS.COURSES_LESSONS_DELETE,
  PERMISSIONS.COURSES_LESSONS_PUBLISH,
  PERMISSIONS.COURSES_LESSONS_REORDER,
  PERMISSIONS.COURSES_MEDIA_UPLOAD,
  PERMISSIONS.COURSES_MEDIA_DELETE,
  PERMISSIONS.COURSES_ATTACHMENTS_MANAGE,
];

const ADMIN_MEDIA_PERMISSIONS = [
  PERMISSIONS.MEDIA_READ,
  PERMISSIONS.MEDIA_UPLOAD,
  PERMISSIONS.MEDIA_UPDATE,
  PERMISSIONS.MEDIA_DELETE,
  PERMISSIONS.MEDIA_RESTORE,
  PERMISSIONS.MEDIA_STORAGE_READ,
  PERMISSIONS.MEDIA_REFERENCES_READ,
  PERMISSIONS.MEDIA_VIDEO_PLAYBACK,
];

const ADMIN_QUIZ_PERMISSIONS = [
  PERMISSIONS.QUIZZES_READ,
  PERMISSIONS.QUIZZES_CREATE,
  PERMISSIONS.QUIZZES_UPDATE,
  PERMISSIONS.QUIZZES_DELETE,
  PERMISSIONS.QUIZZES_PUBLISH,
  PERMISSIONS.QUIZZES_QUESTIONS_MANAGE,
  PERMISSIONS.QUIZZES_QUESTION_BANK_MANAGE,
  PERMISSIONS.QUIZZES_ATTEMPTS_READ,
  PERMISSIONS.QUIZZES_RESULTS_READ,
  PERMISSIONS.QUIZZES_GRADE,
  PERMISSIONS.QUIZZES_ANALYTICS_READ,
];

const ADMIN_ASSIGNMENT_PERMISSIONS = [
  PERMISSIONS.ASSIGNMENTS_READ,
  PERMISSIONS.ASSIGNMENTS_CREATE,
  PERMISSIONS.ASSIGNMENTS_UPDATE,
  PERMISSIONS.ASSIGNMENTS_DELETE,
  PERMISSIONS.ASSIGNMENTS_PUBLISH,
  PERMISSIONS.ASSIGNMENTS_SUBMISSIONS_READ,
  PERMISSIONS.ASSIGNMENTS_GRADE,
];

const ADMIN_COURSE_PERMISSIONS = [
  PERMISSIONS.COURSES_READ,
  PERMISSIONS.COURSES_CREATE,
  PERMISSIONS.COURSES_UPDATE,
  PERMISSIONS.COURSES_DELETE,
  PERMISSIONS.COURSES_PUBLISH,
  PERMISSIONS.COURSES_DUPLICATE,
  PERMISSIONS.COURSES_ANALYTICS_READ,
  PERMISSIONS.COURSES_INSTRUCTORS_MANAGE,
  PERMISSIONS.COURSES_PRICING_MANAGE,
  ...ADMIN_CURRICULUM_PERMISSIONS,
  PERMISSIONS.COURSES_RESOURCES_MANAGE,
  PERMISSIONS.COURSES_REVIEWS_MANAGE,
  PERMISSIONS.COURSES_QA_MANAGE,
  PERMISSIONS.SEO_MANAGE,
  PERMISSIONS.CATEGORIES_MANAGE,
  ...ADMIN_MEDIA_PERMISSIONS,
  ...ADMIN_QUIZ_PERMISSIONS,
  ...ADMIN_ASSIGNMENT_PERMISSIONS,
];

const INSTRUCTOR_PERMISSIONS = [
  PERMISSIONS.INSTRUCTOR_COURSES_READ,
  PERMISSIONS.INSTRUCTOR_COURSES_UPDATE,
  PERMISSIONS.INSTRUCTOR_CURRICULUM_MANAGE,
  PERMISSIONS.INSTRUCTOR_RESOURCES_MANAGE,
  PERMISSIONS.INSTRUCTOR_STUDENTS_READ,
  PERMISSIONS.INSTRUCTOR_REVIEWS_READ,
  PERMISSIONS.MEDIA_READ,
  PERMISSIONS.MEDIA_UPLOAD,
  PERMISSIONS.MEDIA_UPDATE,
  PERMISSIONS.MEDIA_REFERENCES_READ,
  PERMISSIONS.MEDIA_VIDEO_PLAYBACK,
  PERMISSIONS.QUIZZES_READ,
  PERMISSIONS.QUIZZES_CREATE,
  PERMISSIONS.QUIZZES_UPDATE,
  PERMISSIONS.QUIZZES_QUESTIONS_MANAGE,
  PERMISSIONS.QUIZZES_QUESTION_BANK_MANAGE,
  PERMISSIONS.QUIZZES_ATTEMPTS_READ,
  PERMISSIONS.QUIZZES_RESULTS_READ,
  PERMISSIONS.QUIZZES_GRADE,
  PERMISSIONS.QUIZZES_ANALYTICS_READ,
  PERMISSIONS.ASSIGNMENTS_READ,
  PERMISSIONS.ASSIGNMENTS_CREATE,
  PERMISSIONS.ASSIGNMENTS_UPDATE,
  PERMISSIONS.ASSIGNMENTS_PUBLISH,
  PERMISSIONS.ASSIGNMENTS_SUBMISSIONS_READ,
  PERMISSIONS.ASSIGNMENTS_GRADE,
];

export const PERMISSION_CATALOG = Object.freeze([
  { code: PERMISSIONS.USERS_READ, name: 'Read users', module: 'users' },
  { code: PERMISSIONS.USERS_WRITE, name: 'Create/update users', module: 'users' },
  { code: PERMISSIONS.USERS_DELETE, name: 'Delete users', module: 'users' },
  { code: PERMISSIONS.ROLES_READ, name: 'Read roles', module: 'roles' },
  { code: PERMISSIONS.ROLES_WRITE, name: 'Create/update roles', module: 'roles' },
  { code: PERMISSIONS.ROLES_DELETE, name: 'Delete roles', module: 'roles' },
  { code: PERMISSIONS.PERMISSIONS_READ, name: 'Read permissions', module: 'permissions' },
  {
    code: PERMISSIONS.PERMISSIONS_ASSIGN,
    name: 'Assign permissions to roles',
    module: 'permissions',
  },
  { code: PERMISSIONS.COURSES_READ, name: 'Read courses', module: 'courses' },
  { code: PERMISSIONS.COURSES_CREATE, name: 'Create courses', module: 'courses' },
  { code: PERMISSIONS.COURSES_UPDATE, name: 'Update courses', module: 'courses' },
  { code: PERMISSIONS.COURSES_DELETE, name: 'Delete courses', module: 'courses' },
  { code: PERMISSIONS.COURSES_PUBLISH, name: 'Publish courses', module: 'courses' },
  { code: PERMISSIONS.COURSES_DUPLICATE, name: 'Duplicate courses', module: 'courses' },
  { code: PERMISSIONS.COURSES_ANALYTICS_READ, name: 'Read course analytics', module: 'courses' },
  {
    code: PERMISSIONS.COURSES_INSTRUCTORS_MANAGE,
    name: 'Manage course instructors',
    module: 'courses',
  },
  { code: PERMISSIONS.COURSES_PRICING_MANAGE, name: 'Manage course pricing', module: 'courses' },
  {
    code: PERMISSIONS.COURSES_CURRICULUM_MANAGE,
    name: 'Manage course curriculum',
    module: 'courses',
  },
  { code: PERMISSIONS.COURSES_CURRICULUM_READ, name: 'Read curriculum', module: 'courses' },
  { code: PERMISSIONS.COURSES_CURRICULUM_CREATE, name: 'Create topics', module: 'courses' },
  { code: PERMISSIONS.COURSES_CURRICULUM_UPDATE, name: 'Update topics', module: 'courses' },
  { code: PERMISSIONS.COURSES_CURRICULUM_DELETE, name: 'Delete topics', module: 'courses' },
  { code: PERMISSIONS.COURSES_CURRICULUM_REORDER, name: 'Reorder topics', module: 'courses' },
  { code: PERMISSIONS.COURSES_LESSONS_READ, name: 'Read lessons', module: 'courses' },
  { code: PERMISSIONS.COURSES_LESSONS_CREATE, name: 'Create lessons', module: 'courses' },
  { code: PERMISSIONS.COURSES_LESSONS_UPDATE, name: 'Update lessons', module: 'courses' },
  { code: PERMISSIONS.COURSES_LESSONS_DELETE, name: 'Delete lessons', module: 'courses' },
  { code: PERMISSIONS.COURSES_LESSONS_PUBLISH, name: 'Publish lessons', module: 'courses' },
  { code: PERMISSIONS.COURSES_LESSONS_REORDER, name: 'Reorder lessons', module: 'courses' },
  { code: PERMISSIONS.COURSES_MEDIA_UPLOAD, name: 'Upload lesson media', module: 'courses' },
  { code: PERMISSIONS.COURSES_MEDIA_DELETE, name: 'Delete lesson media', module: 'courses' },
  {
    code: PERMISSIONS.COURSES_ATTACHMENTS_MANAGE,
    name: 'Manage lesson attachments',
    module: 'courses',
  },
  {
    code: PERMISSIONS.COURSES_RESOURCES_MANAGE,
    name: 'Manage course resources',
    module: 'courses',
  },
  { code: PERMISSIONS.COURSES_REVIEWS_MANAGE, name: 'Manage course reviews', module: 'courses' },
  { code: PERMISSIONS.COURSES_QA_MANAGE, name: 'Manage course Q&A', module: 'courses' },
  { code: PERMISSIONS.SEO_MANAGE, name: 'Manage SEO settings', module: 'seo' },
  { code: PERMISSIONS.CATEGORIES_MANAGE, name: 'Manage course categories', module: 'categories' },
  {
    code: PERMISSIONS.INSTRUCTOR_COURSES_READ,
    name: 'Instructor read assigned courses',
    module: 'instructor',
  },
  {
    code: PERMISSIONS.INSTRUCTOR_COURSES_UPDATE,
    name: 'Instructor update assigned courses',
    module: 'instructor',
  },
  {
    code: PERMISSIONS.INSTRUCTOR_CURRICULUM_MANAGE,
    name: 'Instructor manage curriculum',
    module: 'instructor',
  },
  {
    code: PERMISSIONS.INSTRUCTOR_RESOURCES_MANAGE,
    name: 'Instructor manage resources',
    module: 'instructor',
  },
  {
    code: PERMISSIONS.INSTRUCTOR_STUDENTS_READ,
    name: 'Instructor read students',
    module: 'instructor',
  },
  {
    code: PERMISSIONS.INSTRUCTOR_REVIEWS_READ,
    name: 'Instructor read reviews',
    module: 'instructor',
  },
  { code: PERMISSIONS.MEDIA_READ, name: 'Read media library', module: 'media' },
  { code: PERMISSIONS.MEDIA_UPLOAD, name: 'Upload media', module: 'media' },
  { code: PERMISSIONS.MEDIA_UPDATE, name: 'Update media metadata', module: 'media' },
  { code: PERMISSIONS.MEDIA_DELETE, name: 'Delete unused media', module: 'media' },
  { code: PERMISSIONS.MEDIA_RESTORE, name: 'Restore soft-deleted media', module: 'media' },
  { code: PERMISSIONS.MEDIA_STORAGE_READ, name: 'Read storage statistics', module: 'media' },
  { code: PERMISSIONS.MEDIA_REFERENCES_READ, name: 'Read media references', module: 'media' },
  {
    code: PERMISSIONS.MEDIA_VIDEO_PLAYBACK,
    name: 'Authorize protected media view/playback',
    module: 'media',
  },
  { code: PERMISSIONS.QUIZZES_READ, name: 'Read quizzes', module: 'quizzes' },
  { code: PERMISSIONS.QUIZZES_CREATE, name: 'Create quizzes', module: 'quizzes' },
  { code: PERMISSIONS.QUIZZES_UPDATE, name: 'Update quizzes', module: 'quizzes' },
  { code: PERMISSIONS.QUIZZES_DELETE, name: 'Delete quizzes', module: 'quizzes' },
  { code: PERMISSIONS.QUIZZES_PUBLISH, name: 'Publish quizzes', module: 'quizzes' },
  {
    code: PERMISSIONS.QUIZZES_QUESTIONS_MANAGE,
    name: 'Manage quiz questions',
    module: 'quizzes',
  },
  {
    code: PERMISSIONS.QUIZZES_QUESTION_BANK_MANAGE,
    name: 'Manage question bank',
    module: 'quizzes',
  },
  {
    code: PERMISSIONS.QUIZZES_ATTEMPTS_READ,
    name: 'Read quiz attempts',
    module: 'quizzes',
  },
  {
    code: PERMISSIONS.QUIZZES_RESULTS_READ,
    name: 'Read quiz results',
    module: 'quizzes',
  },
  { code: PERMISSIONS.QUIZZES_GRADE, name: 'Grade quiz attempts', module: 'quizzes' },
  {
    code: PERMISSIONS.QUIZZES_ANALYTICS_READ,
    name: 'Read quiz analytics',
    module: 'quizzes',
  },
  { code: PERMISSIONS.ASSIGNMENTS_READ, name: 'Read assignments', module: 'assignments' },
  { code: PERMISSIONS.ASSIGNMENTS_CREATE, name: 'Create assignments', module: 'assignments' },
  { code: PERMISSIONS.ASSIGNMENTS_UPDATE, name: 'Update assignments', module: 'assignments' },
  { code: PERMISSIONS.ASSIGNMENTS_DELETE, name: 'Delete assignments', module: 'assignments' },
  { code: PERMISSIONS.ASSIGNMENTS_PUBLISH, name: 'Publish assignments', module: 'assignments' },
  {
    code: PERMISSIONS.ASSIGNMENTS_SUBMISSIONS_READ,
    name: 'Read assignment submissions',
    module: 'assignments',
  },
  { code: PERMISSIONS.ASSIGNMENTS_GRADE, name: 'Grade assignment submissions', module: 'assignments' },
  { code: PERMISSIONS.ENQUIRIES_READ, name: 'Read enquiries and support tickets', module: 'enquiries' },
  {
    code: PERMISSIONS.ENQUIRIES_MANAGE,
    name: 'Manage enquiries and support tickets',
    module: 'enquiries',
  },
]);

export const QUESTION_TYPES = Object.freeze([
  'multiple_choice',
  'multiple_select',
  'true_false',
  'short_answer',
  'long_answer',
  'fill_in_the_blanks',
]);

export const QUIZ_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});

export const QUIZ_SHOW_RESULTS = Object.freeze([
  'immediate',
  'after_submission',
  'after_manual_grading',
  'scheduled',
]);

export const ATTEMPT_STATUS = Object.freeze([
  'in_progress',
  'submitted',
  'evaluating',
  'evaluated',
  'expired',
  'abandoned',
]);

export const ASSIGNMENT_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CLOSED: 'closed',
  ARCHIVED: 'archived',
});

export const ASSIGNMENT_SUBMISSION_TYPES = Object.freeze([
  'file_upload',
  'text',
  'file_and_text',
]);

export const SUBMISSION_STATUS = Object.freeze([
  'submitted',
  'under_review',
  'evaluated',
  'returned',
  'resubmitted',
]);

export const DEFAULT_ROLES = Object.freeze([
  {
    name: 'Super Admin',
    slug: ROLE_SLUGS.SUPER_ADMIN,
    description: 'Full platform access',
    isSystem: true,
    permissions: Object.values(PERMISSIONS),
  },
  {
    name: 'Admin',
    slug: ROLE_SLUGS.ADMIN,
    description: 'Manage users, roles and courses',
    isSystem: true,
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_WRITE,
      PERMISSIONS.USERS_DELETE,
      PERMISSIONS.ROLES_READ,
      PERMISSIONS.ROLES_WRITE,
      PERMISSIONS.ROLES_DELETE,
      PERMISSIONS.PERMISSIONS_READ,
      PERMISSIONS.PERMISSIONS_ASSIGN,
      PERMISSIONS.ENQUIRIES_READ,
      PERMISSIONS.ENQUIRIES_MANAGE,
      ...ADMIN_COURSE_PERMISSIONS,
    ],
  },
  {
    name: 'Instructor',
    slug: ROLE_SLUGS.INSTRUCTOR,
    description: 'Manage assigned courses and curriculum',
    isSystem: true,
    permissions: INSTRUCTOR_PERMISSIONS,
  },
  {
    name: 'Student',
    slug: ROLE_SLUGS.STUDENT,
    description: 'Default registered learner',
    isSystem: true,
    permissions: [],
  },
]);

export const COURSE_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});

/**
 * Course delivery type — independent of category and pricing.type.
 * FREE: direct self-enrollment, no payment.
 * PRE_RECORDED: self-enrollment via verified payment (existing checkout flow).
 * LIVE_SESSION: application-based enrollment reviewed by admin.
 */
export const COURSE_TYPES = Object.freeze(['FREE', 'PRE_RECORDED', 'LIVE_SESSION']);

export const LIVE_APPLICATION_STATUSES = Object.freeze([
  'PENDING',
  'UNDER_REVIEW',
  'CONTACTED',
  'APPROVED',
  'REJECTED',
  'CONVERTED',
]);

export const LIVE_COURSE_INTERESTS = Object.freeze([
  'DevOps',
  'Computerized System Validation Course',
  'Basic End User LIMS application course',
  'Advance Adminstrative LIMS application course',
  'Pharmacovigilance Diploma & Certification Courses',
  'Sterile Manufacturing',
  'Clinical Data Management Diploma & Certification Courses',
  'Medical writing Course',
  'Integrated industrial course of PV, CR, CDMS & DRA',
  'Drug Regulatory Affairs Certification',
  'Pharmaceuticals Engineering Course',
  'Pharmaceuticals Validation Course',
  'Pharmaceuticals Quality Assurance and validation Professuonal Course',
  'Manufacturing Execuation System Course',
  'SAP S4 HANA',
  'Pharmaceuticals GMP proffesional course',
  'Manufacturing Execuation Application Course',
  'Empower 3 Course',
  'Other Course (Mention in Comment Box)',
]);

export const LIVE_COURSE_REFERRAL_SOURCES = Object.freeze([
  'LinkedIn',
  'Website',
  'Referral',
  'Training Institute / Partner',
  'Google Search',
  'Friend / Colleague',
  'Existing Student / Alumni',
  'Company / Employer',
  'YouTube',
  'WhatsApp',
  'Advertisement',
  'Instagram',
  'Facebook',
  'Other',
]);

export const COURSE_LEVELS = Object.freeze([
  'beginner',
  'intermediate',
  'advanced',
  'all_levels',
]);

export const DURATION_UNITS = Object.freeze(['minutes', 'hours', 'days', 'weeks']);

export const LESSON_TYPES = Object.freeze(['video', 'text', 'live', 'resource']);

export const VIDEO_PROCESSING_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
});

export const REVIEW_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

export const QUESTION_STATUS = Object.freeze({
  OPEN: 'open',
  RESOLVED: 'resolved',
});

export const QUESTION_SENDER_ROLES = Object.freeze({
  STUDENT: 'student',
  ADMIN: 'admin',
  INSTRUCTOR: 'instructor',
});

/** Shared lifecycle for website enquiries and student support tickets. */
export const SUPPORT_STATUS = Object.freeze({
  OPEN: 'open',
  REVIEWED: 'reviewed',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
});

export const ENQUIRY_CATEGORIES = Object.freeze([
  'general',
  'courses',
  'pricing',
  'technical',
  'partnership',
  'other',
]);

export const TICKET_CATEGORIES = Object.freeze([
  'account_login',
  'course_learning',
  'payment_fees',
  'certificate',
  'technical_issue',
  'other',
]);

export const TICKET_PRIORITIES = Object.freeze(['low', 'normal', 'high', 'urgent']);

/** Conversation messages: public = visible to the student/visitor, internal = staff only. */
export const MESSAGE_VISIBILITY = Object.freeze({
  PUBLIC: 'public',
  INTERNAL: 'internal',
});

export const TICKET_SENDER_ROLES = Object.freeze({
  STUDENT: 'student',
  ADMIN: 'admin',
  INSTRUCTOR: 'instructor',
});

/** Built-in public website pages that support Page SEO */
export const SEO_PAGE_IDENTIFIERS = Object.freeze([
  'home',
  'courses',
  'about',
  'contact',
  'pricing',
  'blog',
  'login',
  'register',
]);

export const SUPPORTED_CURRENCIES = Object.freeze(['INR', 'USD', 'EUR', 'GBP']);
