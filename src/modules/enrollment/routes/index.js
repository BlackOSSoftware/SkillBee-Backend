import adminEnrollmentRoutes, {
  adminCourseEnrollmentsRouter,
  adminStudentEnrollmentsRouter,
} from './adminEnrollment.routes.js';
import {
  studentCoursesRouter,
  studentLessonProgressRouter,
} from './studentEnrollment.routes.js';

export function mountEnrollmentRoutes(app, apiPrefix) {
  app.use(`${apiPrefix}/admin/enrollments`, adminEnrollmentRoutes);
  app.use(`${apiPrefix}/admin/courses/:courseId/enrollments`, adminCourseEnrollmentsRouter);
  app.use(`${apiPrefix}/admin/students/:studentId/enrollments`, adminStudentEnrollmentsRouter);

  app.use(`${apiPrefix}/student`, studentCoursesRouter);
  app.use(`${apiPrefix}/student/lessons`, studentLessonProgressRouter);
}
