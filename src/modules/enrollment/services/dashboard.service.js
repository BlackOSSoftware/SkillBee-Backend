import { ASSIGNMENT_STATUS } from '../../../config/security.js';
import { Assignment } from '../../../models/Assignment.js';
import { AssignmentSubmission } from '../../../models/AssignmentSubmission.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { LessonProgress } from '../../../models/LessonProgress.js';
import { Quiz } from '../../../models/Quiz.js';
import { QuizAttempt } from '../../../models/QuizAttempt.js';
import { getOrSetCache } from '../../../services/cache/cache.service.js';
import { CACHE_TTL, studentDashboardKey } from '../../../services/cache/keys.js';
export async function getStudentDashboard(req) {
  const studentId = req.user._id;
  const key = studentDashboardKey(studentId.toString());

  return getOrSetCache(key, CACHE_TTL.DASHBOARD, async () => {
    const now = new Date();
    const base = { studentId, deletedAt: null };

    const [
      totalEnrolled,
      completed,
      revoked,
      expiredStatus,
      enrollments,
      completedLessonsAgg,
    ] = await Promise.all([
      CourseEnrollment.countDocuments(base),
      CourseEnrollment.countDocuments({
        ...base,
        $or: [{ status: 'completed' }, { courseCompletionStatus: 'completed' }],
      }),
      CourseEnrollment.countDocuments({ ...base, status: { $in: ['revoked', 'cancelled'] } }),
      CourseEnrollment.countDocuments({
        ...base,
        $or: [
          { status: 'expired' },
          {
            expiresAt: { $ne: null, $lte: now },
            status: { $in: ['active', 'completed'] },
          },
        ],
      }),
      CourseEnrollment.find(base)
        .select(
          'courseId status progressPercentage courseCompletionStatus enrolledAt expiresAt lastAccessedAt completedAt completedLessonsCount totalRequiredLessons'
        )
        .populate('courseId', 'title slug thumbnail')
        .sort({ lastAccessedAt: -1, enrolledAt: -1 })
        .lean(),
      LessonProgress.aggregate([
        {
          $match: {
            studentId,
            completionStatus: 'completed',
            revokedAt: null,
          },
        },
        { $count: 'n' },
      ]),
    ]);

    const activeEnrollments = enrollments.filter((e) => {
      if (!['active', 'completed'].includes(e.status)) return false;
      if (e.expiresAt && new Date(e.expiresAt) <= now) return false;
      return true;
    });

    const inProgress = activeEnrollments.filter(
      (e) =>
        e.progressPercentage > 0 &&
        e.courseCompletionStatus !== 'completed' &&
        e.status !== 'completed'
    );
    const pending = activeEnrollments.filter(
      (e) => e.progressPercentage === 0 && e.courseCompletionStatus === 'not_started'
    );

    const courseIds = activeEnrollments.map((e) => e.courseId?._id || e.courseId).filter(Boolean);

    const [upcomingAssignments, pendingEvaluations, pendingQuizzes, recentLessons] =
      await Promise.all([
        courseIds.length
          ? Assignment.find({
              courseId: { $in: courseIds },
              deletedAt: null,
              status: ASSIGNMENT_STATUS.PUBLISHED,
              dueDate: { $ne: null, $gte: now },
            })
              .sort({ dueDate: 1 })
              .limit(10)
              .select('title dueDate courseId maximumMarks')
              .lean()
          : [],
        courseIds.length
          ? AssignmentSubmission.countDocuments({
              studentId,
              deletedAt: null,
              status: { $in: ['submitted', 'under_review', 'resubmitted'] },
            })
          : 0,
        courseIds.length
          ? (async () => {
              const quizzes = await Quiz.find({
                courseId: { $in: courseIds },
                deletedAt: null,
                status: 'published',
              })
                .select('_id')
                .lean();
              if (!quizzes.length) return 0;
              const quizIds = quizzes.map((q) => q._id);
              const passed = await QuizAttempt.find({
                studentId,
                quizId: { $in: quizIds },
                deletedAt: null,
                passed: true,
                status: 'evaluated',
              })
                .select('quizId')
                .lean();
              const passedSet = new Set(passed.map((p) => p.quizId.toString()));
              return quizIds.filter((id) => !passedSet.has(id.toString())).length;
            })()
          : 0,
        LessonProgress.find({
          studentId,
          completionStatus: 'completed',
          revokedAt: null,
        })
          .sort({ completedAt: -1 })
          .limit(5)
          .select('lessonId courseId completedAt')
          .lean(),
      ]);

    const recentlyAccessed = activeEnrollments
      .filter((e) => e.lastAccessedAt)
      .slice(0, 5)
      .map((e) => ({
        enrollmentId: e._id.toString(),
        courseId: (e.courseId?._id || e.courseId)?.toString?.(),
        title: e.courseId?.title,
        slug: e.courseId?.slug,
        lastAccessedAt: e.lastAccessedAt,
        progressPercentage: e.progressPercentage,
      }));

    return {
      totals: {
        enrolledCourses: totalEnrolled,
        activeCourses: activeEnrollments.length,
        inProgressCourses: inProgress.length,
        completedCourses: completed,
        pendingCourses: pending.length,
        expiredCourses: expiredStatus,
        revokedCourses: revoked,
        completedRequiredLessons: completedLessonsAgg[0]?.n || 0,
      },
      upcomingAssignments: upcomingAssignments.map((a) => ({
        id: a._id.toString(),
        title: a.title,
        dueDate: a.dueDate,
        courseId: a.courseId.toString(),
        maximumMarks: a.maximumMarks,
      })),
      pendingAssignmentEvaluations: pendingEvaluations,
      pendingRequiredQuizzes: pendingQuizzes,
      recentlyAccessedCourses: recentlyAccessed,
      recentlyCompletedLessons: recentLessons.map((r) => ({
        lessonId: r.lessonId.toString(),
        courseId: r.courseId.toString(),
        completedAt: r.completedAt,
      })),
    };
  });
}
