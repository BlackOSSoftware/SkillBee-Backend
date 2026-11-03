/** Centralized cache key builders — never put secrets/tokens in keys or values */

export const CACHE_TTL = Object.freeze({
  COURSE_LIST: 300,
  COURSE_DETAIL: 300,
  FEATURED: 300,
  CATEGORIES: 1800,
  INSTRUCTOR_PUBLIC: 900,
  CURRICULUM: 300,
  ASSIGNMENT_LIST: 120,
  ASSIGNMENT_DETAIL: 120,
  QUIZ_META: 120,
  DASHBOARD: 60,
  STATIC: 1800,
  STUDENT_COURSES: 60,
  STUDENT_PROGRESS: 60,
  ADMIN_ENROLLMENTS: 60,
});

export const PREFIX = Object.freeze({
  COURSE_LIST: 'public:courses:list',
  COURSE_DETAIL: 'public:courses:detail',
  FEATURED: 'public:courses:featured',
  CATEGORIES: 'public:categories',
  CURRICULUM: 'public:curriculum',
  ASSIGNMENT_PUBLISHED: 'public:assignments',
  QUIZ_META: 'public:quizzes:meta',
  DASHBOARD_COURSE: 'admin:course:analytics',
  STUDENT_ASSIGNMENTS: 'student:assignments',
  STUDENT_COURSES: 'student:courses',
  STUDENT_DASHBOARD: 'student:dashboard',
  STUDENT_PROGRESS: 'student:progress',
  ADMIN_ENROLLMENTS: 'admin:enrollments',
  STUDENT_CERTIFICATES: 'student:certificates',
  ADMIN_CERTIFICATES: 'admin:certificates',
  CERTIFICATE_TEMPLATES: 'certificate:templates',
  STUDENT_ORDERS: 'student:orders',
  ADMIN_ORDERS: 'admin:orders',
  STUDENT_CART: 'student:cart',
});

export function courseListKey(query = {}) {
  const parts = [
    query.page || 1,
    query.limit || 20,
    query.categoryId || '-',
    query.level || '-',
    query.language || '-',
    query.pricingType || '-',
    query.isFeatured === undefined ? '-' : String(query.isFeatured),
    query.search || '-',
  ];
  return `${PREFIX.COURSE_LIST}:${parts.join(':')}`;
}

export function courseDetailKey(slug, enrolled = false) {
  return `${PREFIX.COURSE_DETAIL}:${slug}:enrolled:${enrolled ? 1 : 0}`;
}

export function featuredKey() {
  return PREFIX.FEATURED;
}

export function categoriesKey() {
  return PREFIX.CATEGORIES;
}

export function curriculumKey(slug, enrolled = false) {
  return `${PREFIX.CURRICULUM}:${slug}:enrolled:${enrolled ? 1 : 0}`;
}

export function assignmentPublishedListKey(courseId) {
  return `${PREFIX.ASSIGNMENT_PUBLISHED}:course:${courseId || 'all'}`;
}

export function assignmentDetailKey(id) {
  return `${PREFIX.ASSIGNMENT_PUBLISHED}:detail:${id}`;
}

export function quizMetaKey(id) {
  return `${PREFIX.QUIZ_META}:${id}`;
}

export function courseAnalyticsKey(courseId) {
  return `${PREFIX.DASHBOARD_COURSE}:${courseId}`;
}

export function studentAssignmentsKey(studentId, courseId = 'all') {
  return `${PREFIX.STUDENT_ASSIGNMENTS}:${studentId}:${courseId}`;
}

export function studentCoursesKey(studentId, filter = 'all') {
  return `${PREFIX.STUDENT_COURSES}:${studentId}:${filter}`;
}

export function studentDashboardKey(studentId) {
  return `${PREFIX.STUDENT_DASHBOARD}:${studentId}`;
}

export function studentProgressKey(studentId, courseId) {
  return `${PREFIX.STUDENT_PROGRESS}:${studentId}:${courseId}`;
}

export function adminEnrollmentsKey(query = {}) {
  const parts = [
    query.page || 1,
    query.limit || 20,
    query.courseId || '-',
    query.studentId || '-',
    query.status || '-',
    query.enrollmentType || '-',
    query.courseCompletionStatus || '-',
    query.sortBy || 'enrolledAt',
    query.sortOrder || 'desc',
    query.enrolledFrom || '-',
    query.enrolledTo || '-',
    query.progressMin ?? '-',
    query.progressMax ?? '-',
  ];
  return `${PREFIX.ADMIN_ENROLLMENTS}:${parts.join(':')}`;
}

export function studentCertificatesKey(studentId) {
  return `${PREFIX.STUDENT_CERTIFICATES}:${studentId}`;
}

export function adminCertificatesKey(query = {}) {
  const parts = [
    query.page || 1,
    query.limit || 20,
    query.studentId || '-',
    query.courseId || '-',
    query.status || '-',
  ];
  return `${PREFIX.ADMIN_CERTIFICATES}:${parts.join(':')}`;
}

export function certificateTemplatesKey(query = {}) {
  const parts = [query.page || 1, query.limit || 20, query.status || '-', query.search || '-'];
  return `${PREFIX.CERTIFICATE_TEMPLATES}:${parts.join(':')}`;
}

export function studentOrdersKey(studentId) {
  return `${PREFIX.STUDENT_ORDERS}:${studentId}`;
}

export function adminOrdersKey(query = {}) {
  const parts = [
    query.page || 1,
    query.limit || 20,
    query.orderStatus || '-',
    query.paymentStatus || '-',
    query.studentId || '-',
    query.courseId || '-',
    query.orderNumber || '-',
  ];
  return `${PREFIX.ADMIN_ORDERS}:${parts.join(':')}`;
}

export function studentCartKey(studentId) {
  return `${PREFIX.STUDENT_CART}:${studentId}`;
}
