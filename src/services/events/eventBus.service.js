import { notifyUser } from '../../modules/notifications/services/notification.service.js';
import { enqueueEmail } from '../../modules/email/services/emailQueue.service.js';

/**
 * Central event dispatcher for notifications + emails.
 * Never throws to business callers — fire-and-forget with logging.
 */
export async function emitAppEvent(eventName, payload = {}) {
  try {
    switch (eventName) {
      case 'account.created':
        await handleAccountCreated(payload);
        break;
      case 'enrollment.activated':
        await handleEnrollment(payload);
        break;
      case 'payment.successful':
        await handlePaymentSuccess(payload);
        break;
      case 'payment.failed':
        await handlePaymentFailed(payload);
        break;
      case 'assignment.submitted':
        await handleAssignmentSubmitted(payload);
        break;
      case 'assignment.evaluated':
        await handleAssignmentEvaluated(payload);
        break;
      case 'quiz.result':
        await handleQuizResult(payload);
        break;
      case 'certificate.generated':
        await handleCertificate(payload);
        break;
      case 'password.reset_requested':
        await handlePasswordReset(payload);
        break;
      case 'course.announcement':
        await handleCourseAnnouncement(payload);
        break;
      case 'instructor.application_submitted':
        await handleInstructorApplication(payload);
        break;
      case 'referral.submitted':
        await handleReferralSubmitted(payload);
        break;
      case 'blog.published':
        await handleBlogPublished(payload);
        break;
      default:
        break;
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[events] ${eventName} failed:`, err.message);
    }
  }
}

/** Non-blocking emit */
export function emitAppEventAsync(eventName, payload) {
  setImmediate(() => {
    emitAppEvent(eventName, payload).catch(() => undefined);
  });
}

async function handleAccountCreated({ userId, email, firstName, lastName }) {
  const studentName = [firstName, lastName].filter(Boolean).join(' ') || 'Student';
  const eventKey = `account.created:${userId}`;
  await notifyUser({
    recipientId: userId,
    title: 'Welcome to SkillBee',
    message: `Hi ${studentName}, your account is ready.`,
    type: 'account_created',
    category: 'account',
    eventKey: `${eventKey}:notify`,
    data: { userId: String(userId) },
  });
  await enqueueEmail({
    to: email,
    templateSlug: 'welcome',
    eventType: 'account.created',
    eventKey: `${eventKey}:email`,
    variables: { studentName, email },
  });
}

async function handleEnrollment({
  userId,
  email,
  firstName,
  lastName,
  courseId,
  courseName,
  enrollmentId,
}) {
  const studentName = [firstName, lastName].filter(Boolean).join(' ') || 'Student';
  const eventKey = `enrollment:${enrollmentId || `${userId}:${courseId}`}`;
  await notifyUser({
    recipientId: userId,
    title: 'Course enrollment confirmed',
    message: `You are enrolled in ${courseName || 'your course'}.`,
    type: 'course_enrollment',
    category: 'enrollment',
    eventKey: `${eventKey}:notify`,
    data: { courseId: String(courseId || ''), enrollmentId: String(enrollmentId || '') },
  });
  await enqueueEmail({
    to: email,
    templateSlug: 'course_enrollment',
    eventType: 'enrollment.activated',
    eventKey: `${eventKey}:email`,
    variables: { studentName, courseName: courseName || '', email },
  });
}

async function handlePaymentSuccess({
  userId,
  email,
  firstName,
  lastName,
  orderId,
  orderNumber,
  amount,
  currency,
}) {
  const studentName = [firstName, lastName].filter(Boolean).join(' ') || 'Student';
  const eventKey = `payment.success:${orderId}`;
  await notifyUser({
    recipientId: userId,
    title: 'Payment successful',
    message: `Payment for order ${orderNumber || orderId} was successful.`,
    type: 'payment_successful',
    category: 'payment',
    eventKey: `${eventKey}:notify`,
    data: { orderId: String(orderId), orderNumber: String(orderNumber || '') },
  });
  await enqueueEmail({
    to: email,
    templateSlug: 'payment_successful',
    eventType: 'payment.successful',
    eventKey: `${eventKey}:email`,
    variables: {
      studentName,
      orderId: String(orderNumber || orderId),
      amount: String(amount ?? ''),
      currency: String(currency || 'INR'),
      email,
    },
  });
}

async function handlePaymentFailed({
  userId,
  email,
  firstName,
  lastName,
  orderId,
  orderNumber,
}) {
  const studentName = [firstName, lastName].filter(Boolean).join(' ') || 'Student';
  const eventKey = `payment.failed:${orderId}`;
  if (userId) {
    await notifyUser({
      recipientId: userId,
      title: 'Payment failed',
      message: `Payment for order ${orderNumber || orderId} failed.`,
      type: 'payment_failed',
      category: 'payment',
      eventKey: `${eventKey}:notify`,
      data: { orderId: String(orderId) },
    });
  }
  if (email) {
    await enqueueEmail({
      to: email,
      templateSlug: 'payment_failed',
      eventType: 'payment.failed',
      eventKey: `${eventKey}:email`,
      variables: { studentName, orderId: String(orderNumber || orderId), email },
    });
  }
}

async function handleAssignmentSubmitted({
  userId,
  email,
  firstName,
  lastName,
  assignmentId,
  assignmentTitle,
  submissionId,
}) {
  const studentName = [firstName, lastName].filter(Boolean).join(' ') || 'Student';
  const eventKey = `assignment.submitted:${submissionId || assignmentId}:${userId}`;
  await notifyUser({
    recipientId: userId,
    title: 'Assignment submitted',
    message: `We received your submission for ${assignmentTitle || 'your assignment'}.`,
    type: 'assignment_submitted',
    category: 'assignment',
    eventKey: `${eventKey}:notify`,
    data: { assignmentId: String(assignmentId || '') },
  });
  await enqueueEmail({
    to: email,
    templateSlug: 'assignment_submitted',
    eventType: 'assignment.submitted',
    eventKey: `${eventKey}:email`,
    variables: { studentName, assignmentTitle: assignmentTitle || '', email },
  });
}

async function handleAssignmentEvaluated({
  userId,
  email,
  firstName,
  lastName,
  assignmentId,
  assignmentTitle,
  submissionId,
  score,
}) {
  const studentName = [firstName, lastName].filter(Boolean).join(' ') || 'Student';
  const eventKey = `assignment.evaluated:${submissionId || assignmentId}`;
  await notifyUser({
    recipientId: userId,
    title: 'Assignment evaluated',
    message: `Your assignment ${assignmentTitle || ''} has been graded.`,
    type: 'assignment_evaluated',
    category: 'assignment',
    eventKey: `${eventKey}:notify`,
    data: { assignmentId: String(assignmentId || ''), score: String(score ?? '') },
  });
  await enqueueEmail({
    to: email,
    templateSlug: 'assignment_evaluated',
    eventType: 'assignment.evaluated',
    eventKey: `${eventKey}:email`,
    variables: {
      studentName,
      assignmentTitle: assignmentTitle || '',
      score: String(score ?? ''),
      email,
    },
  });
}

async function handleQuizResult({
  userId,
  email,
  firstName,
  lastName,
  quizId,
  quizTitle,
  attemptId,
  score,
}) {
  const studentName = [firstName, lastName].filter(Boolean).join(' ') || 'Student';
  const eventKey = `quiz.result:${attemptId || quizId}:${userId}`;
  await notifyUser({
    recipientId: userId,
    title: 'Quiz result available',
    message: `Your result for ${quizTitle || 'the quiz'} is ready.`,
    type: 'quiz_result',
    category: 'quiz',
    eventKey: `${eventKey}:notify`,
    data: { quizId: String(quizId || ''), score: String(score ?? '') },
  });
  await enqueueEmail({
    to: email,
    templateSlug: 'quiz_result',
    eventType: 'quiz.result',
    eventKey: `${eventKey}:email`,
    variables: {
      studentName,
      quizTitle: quizTitle || '',
      score: String(score ?? ''),
      email,
    },
  });
}

async function handleCertificate({
  userId,
  email,
  firstName,
  lastName,
  certificateId,
  certificateNumber,
  courseName,
}) {
  const studentName = [firstName, lastName].filter(Boolean).join(' ') || 'Student';
  const eventKey = `certificate:${certificateId || certificateNumber}`;
  await notifyUser({
    recipientId: userId,
    title: 'Certificate ready',
    message: `Certificate ${certificateNumber || ''} is ready.`,
    type: 'certificate_generated',
    category: 'certificate',
    eventKey: `${eventKey}:notify`,
    data: {
      certificateId: String(certificateId || ''),
      certificateNumber: String(certificateNumber || ''),
    },
  });
  await enqueueEmail({
    to: email,
    templateSlug: 'certificate_generated',
    eventType: 'certificate.generated',
    eventKey: `${eventKey}:email`,
    variables: {
      studentName,
      certificateNumber: String(certificateNumber || ''),
      courseName: courseName || '',
      email,
    },
  });
}

async function handlePasswordReset({ userId, email, firstName, lastName, resetLink }) {
  const studentName = [firstName, lastName].filter(Boolean).join(' ') || 'Student';
  const eventKey = `password.reset:${userId}:${Date.now()}`;
  // Email only — do not push reset tokens via FCM
  await enqueueEmail({
    to: email,
    templateSlug: 'password_reset',
    eventType: 'password.reset_requested',
    eventKey,
    variables: {
      studentName,
      email,
      resetLink: resetLink || '',
    },
  });
  if (userId) {
    await notifyUser({
      recipientId: userId,
      title: 'Password reset requested',
      message: 'A password reset email was sent if the account exists.',
      type: 'password_reset',
      category: 'account',
      eventKey: `${eventKey}:notify`,
      channels: { inApp: true, push: false },
      data: {},
    });
  }
}

async function handleCourseAnnouncement(payload) {
  // Handled primarily by admin notification API; this is for programmatic emits
  const { userId, email, firstName, lastName, title, message, courseId, announcementId } =
    payload;
  if (!userId) return;
  const studentName = [firstName, lastName].filter(Boolean).join(' ') || 'Student';
  const eventKey = `announcement:${announcementId || courseId}:${userId}`;
  await notifyUser({
    recipientId: userId,
    title: title || 'Course announcement',
    message: message || '',
    type: 'course_announcement',
    category: 'announcement',
    eventKey: `${eventKey}:notify`,
    data: { courseId: String(courseId || '') },
  });
  if (email) {
    await enqueueEmail({
      to: email,
      templateSlug: 'course_announcement',
      eventType: 'course.announcement',
      eventKey: `${eventKey}:email`,
      variables: {
        studentName,
        title: title || '',
        message: message || '',
        email,
      },
    });
  }
}

async function* iterateAdminUserIds() {
  const { ROLE_SLUGS } = await import('../../config/security.js');
  const { Role } = await import('../../models/Role.js');
  const { User } = await import('../../models/User.js');
  const roles = await Role.find({
    slug: { $in: [ROLE_SLUGS.SUPER_ADMIN, ROLE_SLUGS.ADMIN] },
  }).select('_id');
  const roleIds = roles.map((r) => r._id);
  if (!roleIds.length) return;
  const cursor = User.find({
    roleId: { $in: roleIds },
    deletedAt: null,
    status: 'active',
  })
    .select('_id')
    .lean()
    .cursor();
  for await (const u of cursor) {
    if (u._id) yield u._id;
  }
}

async function notifyAdmins({ title, message, type, category, eventKey, data }) {
  for await (const adminId of iterateAdminUserIds()) {
    await notifyUser({
      recipientId: adminId,
      recipientRole: 'admin',
      title,
      message,
      type,
      category,
      eventKey: `${eventKey}:admin:${adminId}`,
      channels: { inApp: true, push: false },
      data,
    });
  }
}

async function handleInstructorApplication({ applicationId, email, fullName, expertSubject }) {
  const eventKey = `instructor.application:${applicationId}`;
  await notifyAdmins({
    title: 'New instructor application',
    message: `${fullName || 'Applicant'} applied for ${expertSubject || 'a subject'}.`,
    type: 'instructor_application',
    category: 'forms',
    eventKey,
    data: { applicationId: String(applicationId || '') },
  });
  if (email) {
    await enqueueEmail({
      to: email,
      templateSlug: 'custom_admin',
      eventType: 'instructor.application_submitted',
      eventKey: `${eventKey}:email`,
      variables: {
        studentName: fullName || 'Applicant',
        email,
        title: 'We received your instructor application',
        message: `Thank you for applying to teach ${expertSubject || 'with SkillBee'}. Our team will review your application shortly.`,
      },
    });
  }
}

async function handleReferralSubmitted({ referralId, email, referrerName, friendName }) {
  const eventKey = `referral.submitted:${referralId}`;
  await notifyAdmins({
    title: 'New referral submitted',
    message: `${referrerName || 'Someone'} referred ${friendName || 'a friend'}.`,
    type: 'referral_submitted',
    category: 'forms',
    eventKey,
    data: { referralId: String(referralId || '') },
  });
  if (email) {
    await enqueueEmail({
      to: email,
      templateSlug: 'custom_admin',
      eventType: 'referral.submitted',
      eventKey: `${eventKey}:email`,
      variables: {
        studentName: referrerName || 'Friend',
        email,
        title: 'Thanks for referring a friend',
        message: `We received your referral for ${friendName || 'your friend'}. Our team will follow up appropriately.`,
      },
    });
  }
}

async function handleBlogPublished({ blogId, title, slug }) {
  // Optional admin in-app notice only (no marketing blast)
  const eventKey = `blog.published:${blogId}`;
  await notifyAdmins({
    title: 'Blog published',
    message: `"${title || slug || 'Post'}" is now live.`,
    type: 'blog_published',
    category: 'content',
    eventKey,
    data: { blogId: String(blogId || ''), slug: String(slug || '') },
  });
}
