import adminQuizRoutes, { adminAttemptRouter } from './adminQuiz.routes.js';
import questionBankRoutes from './quizQuestionBank.routes.js';
import { studentAttemptRouter, studentQuizRouter } from './studentQuiz.routes.js';

export function mountQuizRoutes(app, apiPrefix) {
  app.use(`${apiPrefix}/admin/quizzes`, adminQuizRoutes);
  app.use(`${apiPrefix}/admin/quiz-attempts`, adminAttemptRouter);
  app.use(`${apiPrefix}/admin/question-bank`, questionBankRoutes);
  app.use(`${apiPrefix}/student/quizzes`, studentQuizRouter);
  app.use(`${apiPrefix}/student/quiz-attempts`, studentAttemptRouter);
}
