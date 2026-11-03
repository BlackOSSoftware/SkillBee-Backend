import { COURSE_STATUS, QUIZ_STATUS, USER_STATUS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { CourseLesson } from '../../../models/CourseLesson.js';
import { Quiz } from '../../../models/Quiz.js';
import { QuizAttempt } from '../../../models/QuizAttempt.js';
import { AppError } from '../../../utils/AppError.js';
import { isPlatformAdmin } from './quizAccess.service.js';

export async function assertStudentCanStartQuiz(req, quizId) {
  if (req.user?.status === USER_STATUS.SUSPENDED) {
    throw new AppError('Account is suspended', 403, 'ACCOUNT_SUSPENDED');
  }

  const quiz = await Quiz.findOne({ _id: quizId, deletedAt: null });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
  if (quiz.status !== QUIZ_STATUS.PUBLISHED) {
    throw new AppError('Quiz is not published', 403, 'QUIZ_NOT_PUBLISHED');
  }

  const course = await Course.findOne({ _id: quiz.courseId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  if (course.status !== COURSE_STATUS.PUBLISHED && !isPlatformAdmin(req.role)) {
    throw new AppError('Course is not published', 403, 'COURSE_NOT_PUBLISHED');
  }

  if (quiz.lessonId) {
    const lesson = await CourseLesson.findOne({ _id: quiz.lessonId, deletedAt: null });
    if (!lesson || lesson.courseId.toString() !== quiz.courseId.toString()) {
      throw new AppError('Linked lesson is invalid', 422, 'INVALID_LESSON');
    }
    if (lesson.status !== 'published' && !isPlatformAdmin(req.role)) {
      throw new AppError('Linked lesson is not available', 403, 'LESSON_NOT_AVAILABLE');
    }
    if (lesson.scheduledAt && lesson.scheduledAt > new Date()) {
      throw new AppError('Linked lesson is scheduled for later', 403, 'LESSON_SCHEDULED');
    }
  }

  const now = new Date();
  if (quiz.availability?.enabled) {
    if (quiz.availability.startsAt && quiz.availability.startsAt > now) {
      throw new AppError('Quiz is not available yet', 403, 'QUIZ_NOT_STARTED');
    }
    if (quiz.availability.endsAt && quiz.availability.endsAt < now) {
      throw new AppError('Quiz availability has ended', 403, 'QUIZ_ENDED');
    }
  }

  const { learningEnrollmentQuery } = await import(
    '../../enrollment/services/enrollmentAccess.service.js'
  );
  const enrolled = await CourseEnrollment.exists(
    learningEnrollmentQuery(req.user._id, course._id)
  );
  if (!enrolled && !isPlatformAdmin(req.role)) {
    throw new AppError('Enrollment required', 403, 'NOT_ENROLLED');
  }

  const inProgress = await QuizAttempt.findOne({
    quizId: quiz._id,
    studentId: req.user._id,
    status: 'in_progress',
  });
  if (inProgress) {
    if (quiz.allowResume) {
      return { quiz, course, resumeAttempt: inProgress };
    }
    throw new AppError('An attempt is already in progress', 409, 'ATTEMPT_IN_PROGRESS');
  }

  const completedCount = await QuizAttempt.countDocuments({
    quizId: quiz._id,
    studentId: req.user._id,
    status: { $in: ['submitted', 'evaluating', 'evaluated', 'expired'] },
  });
  if (quiz.maximumAttempts && completedCount >= quiz.maximumAttempts) {
    throw new AppError('Maximum attempts reached', 403, 'MAX_ATTEMPTS');
  }

  return { quiz, course, resumeAttempt: null, nextAttemptNumber: completedCount + 1 };
}
