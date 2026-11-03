import { ASSIGNMENT_STATUS } from '../../../config/security.js';
import { Assignment } from '../../../models/Assignment.js';
import { AssignmentSubmission } from '../../../models/AssignmentSubmission.js';
import { Quiz } from '../../../models/Quiz.js';
import { QuizAttempt } from '../../../models/QuizAttempt.js';
import { AppError } from '../../../utils/AppError.js';

/**
 * Lesson-type completion rules (Phase 7).
 *
 * Video: no server-side playback progress tracker exists yet.
 * Explicit completion is allowed after enrollment/access checks, but
 * client-supplied watchDurationSeconds is NEVER treated as verification proof.
 * See docs/progress-calculation.md.
 *
 * Live: cannot complete until liveSession.endsAt has passed (or no endsAt set → explicit OK after access).
 * Text / resource: explicit completion after access verified.
 * Linked quiz (Quiz.lessonId): require passed evaluated attempt.
 * Linked assignment (Assignment.lessonId): require evaluated submission (not merely opened).
 */

export async function assertLessonCompletionAllowed({
  lesson,
  studentId,
  clientPayload = {},
}) {
  // Never accept authoritative progress fields from client
  if (
    clientPayload.progressPercentage !== undefined ||
    clientPayload.completedLessonsCount !== undefined ||
    clientPayload.isCourseCompleted !== undefined ||
    clientPayload.courseCompletionStatus !== undefined
  ) {
    throw new AppError(
      'Client-supplied progress fields are not accepted',
      400,
      'PROGRESS_TRUST_VIOLATION'
    );
  }

  const type = lesson.type;

  if (type === 'live') {
    const endsAt = lesson.content?.liveSession?.endsAt;
    if (endsAt && new Date(endsAt) > new Date()) {
      throw new AppError(
        'Live lesson cannot be completed before the session ends',
        400,
        'LIVE_SESSION_ACTIVE'
      );
    }
  }

  if (type === 'video') {
    // Informational only — ignore as proof
    void clientPayload.watchDurationSeconds;
  }

  // Linked published quiz → must have passed
  const linkedQuiz = await Quiz.findOne({
    lessonId: lesson._id,
    deletedAt: null,
    status: 'published',
  })
    .select('_id passingPercentage')
    .lean();

  if (linkedQuiz) {
    const passed = await QuizAttempt.exists({
      quizId: linkedQuiz._id,
      studentId,
      deletedAt: null,
      status: 'evaluated',
      passed: true,
    });
    if (!passed) {
      throw new AppError(
        'Required quiz for this lesson has not been passed',
        400,
        'QUIZ_REQUIREMENT_PENDING'
      );
    }
  }

  // Linked published/closed assignment → must have evaluated submission
  const linkedAssignment = await Assignment.findOne({
    lessonId: lesson._id,
    deletedAt: null,
    status: { $in: [ASSIGNMENT_STATUS.PUBLISHED, ASSIGNMENT_STATUS.CLOSED] },
  })
    .select('_id')
    .lean();

  if (linkedAssignment) {
    const ok = await AssignmentSubmission.exists({
      assignmentId: linkedAssignment._id,
      studentId,
      deletedAt: null,
      status: { $in: ['evaluated', 'returned'] },
    });
    if (!ok) {
      throw new AppError(
        'Required assignment for this lesson is not evaluated',
        400,
        'ASSIGNMENT_REQUIREMENT_PENDING'
      );
    }
  }

  return { completionSource: 'student_explicit' };
}
