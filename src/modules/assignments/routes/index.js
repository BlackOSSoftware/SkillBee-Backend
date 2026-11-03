import adminAssignmentRoutes, {
  adminSubmissionRouter,
} from './adminAssignment.routes.js';
import {
  studentAssignmentRouter,
  studentSubmissionRouter,
} from './studentAssignment.routes.js';

export function mountAssignmentRoutes(app, apiPrefix) {
  app.use(`${apiPrefix}/admin/assignments`, adminAssignmentRoutes);
  app.use(`${apiPrefix}/admin/submissions`, adminSubmissionRouter);
  app.use(`${apiPrefix}/student/assignments`, studentAssignmentRouter);
  app.use(`${apiPrefix}/student/submissions`, studentSubmissionRouter);
}
