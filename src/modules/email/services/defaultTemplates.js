import { brandedEmail, ctaButton, detailTable, muted, p, sitePath } from './emailLayout.js';

/**
 * Default system email templates — premium branded designs.
 *
 * `designVersion` is bumped whenever the built-in design changes;
 * ensureDefaultTemplates() upgrades system templates that are still on an
 * older version (custom/admin-edited copies are only touched while isSystem).
 *
 * Only variables from ALLOWED_TEMPLATE_VARS may appear as {{placeholders}}.
 */
export const EMAIL_DESIGN_VERSION = 1;

const COURSES_URL = sitePath('/courses');
const HOME_URL = sitePath('/');

function greeting() {
  return p('Hi {{studentName}},');
}

function signOff() {
  return muted('Need a hand? Just reply to this email and our team will help you out.');
}

export const DEFAULT_TEMPLATES = [
  {
    slug: 'welcome',
    name: 'Welcome / Account Created',
    subject: 'Welcome to SkillBee — your account is ready',
    htmlBody: brandedEmail({
      preheader: 'Your SkillBee account is ready — start learning today.',
      eyebrow: 'Welcome',
      heading: 'Welcome to SkillBee',
      bodyHtml:
        greeting() +
        p('Your account has been created successfully. You can now explore our courses, track your progress, and earn certificates — all in one place.') +
        detailTable([{ label: 'Account email', value: '{{email}}' }]) +
        ctaButton({ label: 'Explore courses', url: COURSES_URL }) +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nYour SkillBee account ({{email}}) is ready. Explore our courses and start learning today: ' +
      COURSES_URL +
      '\n\n— The SkillBee Team',
    variables: ['studentName', 'email'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'course_enrollment',
    name: 'Course Enrollment Confirmation',
    subject: "You're enrolled in {{courseName}}",
    htmlBody: brandedEmail({
      preheader: 'Your enrollment in {{courseName}} is confirmed.',
      eyebrow: 'Enrollment confirmed',
      heading: 'You\u2019re enrolled',
      bodyHtml:
        greeting() +
        p('Great news — your enrollment is confirmed and you now have full access to the course content.') +
        detailTable([{ label: 'Course', value: '{{courseName}}' }]) +
        ctaButton({ label: 'Start learning', url: COURSES_URL }) +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nYou are now enrolled in {{courseName}}. Your course access is active — happy learning!\n\n' +
      COURSES_URL +
      '\n\n— The SkillBee Team',
    variables: ['studentName', 'courseName'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'payment_successful',
    name: 'Successful Payment',
    subject: 'Payment confirmed — order {{orderId}}',
    htmlBody: brandedEmail({
      preheader: 'Your payment of {{amount}} {{currency}} was successful.',
      eyebrow: 'Payment confirmed',
      heading: 'Thank you for your payment',
      bodyHtml:
        greeting() +
        p('We\u2019ve received your payment and your order is confirmed. A receipt for this transaction is available in your account.') +
        detailTable([
          { label: 'Order ID', value: '{{orderId}}' },
          { label: 'Amount', value: '{{amount}} {{currency}}' },
        ]) +
        ctaButton({ label: 'Visit SkillBee', url: HOME_URL }) +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nYour payment of {{amount}} {{currency}} for order {{orderId}} was successful. Thank you!\n\n' +
      HOME_URL +
      '\n\n— The SkillBee Team',
    variables: ['studentName', 'orderId', 'amount', 'currency'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'payment_failed',
    name: 'Failed Payment',
    subject: 'Payment failed — order {{orderId}}',
    htmlBody: brandedEmail({
      preheader: 'Your payment for order {{orderId}} could not be completed.',
      eyebrow: 'Payment issue',
      heading: 'Your payment didn\u2019t go through',
      bodyHtml:
        greeting() +
        p('Unfortunately, we couldn\u2019t complete the payment for this order. No amount has been charged. You can try again using a different payment method.') +
        detailTable([{ label: 'Order ID', value: '{{orderId}}' }]) +
        ctaButton({ label: 'Try again', url: HOME_URL }) +
        muted('If you keep seeing this error, please contact our support team and we\u2019ll help you sort it out.') +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nYour payment for order {{orderId}} could not be completed and no amount was charged. Please try again or contact support if the problem continues.\n\n' +
      HOME_URL +
      '\n\n— The SkillBee Team',
    variables: ['studentName', 'orderId'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'assignment_submitted',
    name: 'Assignment Submitted',
    subject: 'Assignment submitted — {{assignmentTitle}}',
    htmlBody: brandedEmail({
      preheader: 'We received your submission for {{assignmentTitle}}.',
      eyebrow: 'Assignment',
      heading: 'Submission received',
      bodyHtml:
        greeting() +
        p('Thanks for submitting your work. Our evaluators will review it and share your feedback soon.') +
        detailTable([{ label: 'Assignment', value: '{{assignmentTitle}}' }]) +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nWe received your submission for {{assignmentTitle}}. Our team will review it and share feedback soon.\n\n— The SkillBee Team',
    variables: ['studentName', 'assignmentTitle'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'assignment_evaluated',
    name: 'Assignment Evaluated',
    subject: 'Your assignment was graded — {{assignmentTitle}}',
    htmlBody: brandedEmail({
      preheader: 'Your grade for {{assignmentTitle}} is ready.',
      eyebrow: 'Grading complete',
      heading: 'Your assignment was graded',
      bodyHtml:
        greeting() +
        p('Your submission has been evaluated. Here\u2019s a quick summary:') +
        detailTable([
          { label: 'Assignment', value: '{{assignmentTitle}}' },
          { label: 'Score', value: '{{score}}' },
        ]) +
        muted('Sign in to your dashboard to read the detailed feedback.') +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nYour assignment {{assignmentTitle}} has been evaluated. Score: {{score}}. Sign in to your dashboard for detailed feedback.\n\n— The SkillBee Team',
    variables: ['studentName', 'assignmentTitle', 'score'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'quiz_result',
    name: 'Quiz Result',
    subject: 'Quiz result — {{quizTitle}}',
    htmlBody: brandedEmail({
      preheader: 'Your result for {{quizTitle}} is ready.',
      eyebrow: 'Quiz result',
      heading: 'Your quiz result is in',
      bodyHtml:
        greeting() +
        p('You\u2019ve completed the quiz. Here\u2019s how you did:') +
        detailTable([
          { label: 'Quiz', value: '{{quizTitle}}' },
          { label: 'Score', value: '{{score}}' },
        ]) +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nYour result for {{quizTitle}}: {{score}}.\n\n— The SkillBee Team',
    variables: ['studentName', 'quizTitle', 'score'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'certificate_generated',
    name: 'Certificate Generated',
    subject: 'Your certificate is ready — {{certificateNumber}}',
    htmlBody: brandedEmail({
      preheader: 'Congratulations — your SkillBee certificate is ready.',
      eyebrow: 'Certificate',
      heading: 'Congratulations!',
      bodyHtml:
        greeting() +
        p('You\u2019ve earned a certificate of completion. Download it from your dashboard and share your achievement.') +
        detailTable([
          { label: 'Certificate', value: '{{certificateNumber}}' },
          { label: 'Course', value: '{{courseName}}' },
        ]) +
        ctaButton({ label: 'View certificate', url: COURSES_URL }) +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nCongratulations! Your certificate {{certificateNumber}} for {{courseName}} is ready. Download it from your dashboard.\n\n— The SkillBee Team',
    variables: ['studentName', 'certificateNumber', 'courseName'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'course_announcement',
    name: 'Course Announcement',
    subject: '{{title}}',
    htmlBody: brandedEmail({
      preheader: '{{title}}',
      eyebrow: 'Announcement',
      heading: '{{title}}',
      bodyHtml:
        greeting() +
        p('{{message}}') +
        detailTable([{ label: 'Course', value: '{{courseName}}' }]) +
        ctaButton({ label: 'View course', url: COURSES_URL }) +
        signOff(),
    }),
    textBody: 'Hi {{studentName}},\n\n{{message}}\n\n— The SkillBee Team',
    variables: ['studentName', 'title', 'message', 'courseName'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'password_reset',
    name: 'Password Reset',
    subject: 'Reset your SkillBee password',
    htmlBody: brandedEmail({
      preheader: 'Use this secure link to reset your SkillBee password.',
      eyebrow: 'Security',
      heading: 'Reset your password',
      bodyHtml:
        greeting() +
        p('We received a request to reset the password for your SkillBee account. Click the button below to choose a new password.') +
        ctaButton({ label: 'Reset password', url: '{{resetLink}}' }) +
        muted('This link expires soon for your security. If the button doesn\u2019t work, copy and paste this URL into your browser:') +
        muted('<a href="{{resetLink}}" style="color:#1592ca;word-break:break-all;">{{resetLink}}</a>') +
        muted('If you didn\u2019t request a password reset, you can safely ignore this email — your password will stay unchanged.') +
        detailTable([{ label: 'Account email', value: '{{email}}' }]),
      footerNote: 'For your security, never share this link with anyone.',
    }),
    textBody:
      'Hi {{studentName}},\n\nWe received a request to reset your SkillBee password. Use this link to choose a new password:\n{{resetLink}}\n\nThis link expires soon. If you didn\u2019t request this, ignore this email.\n\n— The SkillBee Team',
    variables: ['studentName', 'resetLink', 'email'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'custom_admin',
    name: 'Custom Admin Email',
    subject: '{{title}}',
    htmlBody: brandedEmail({
      preheader: '{{title}}',
      eyebrow: 'Notification',
      heading: '{{title}}',
      bodyHtml:
        greeting() +
        p('{{message}}') +
        ctaButton({ label: 'Open SkillBee', url: HOME_URL }) +
        signOff(),
    }),
    textBody: 'Hi {{studentName}},\n\n{{message}}\n\n— The SkillBee Team',
    variables: ['studentName', 'title', 'message', 'email'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'support_ticket_created',
    name: 'Support Ticket Created',
    subject: 'Support ticket received — {{ticketNumber}}',
    htmlBody: brandedEmail({
      preheader: 'Your support ticket {{ticketNumber}} has been created.',
      eyebrow: 'Support',
      heading: 'We\u2019ve received your ticket',
      bodyHtml:
        greeting() +
        p('Thanks for reaching out. Your support request has been logged and our team will review it shortly.') +
        detailTable([
          { label: 'Ticket number', value: '{{ticketNumber}}' },
          { label: 'Subject', value: '{{title}}' },
          { label: 'Status', value: 'Open' },
        ]) +
        muted('We\u2019ll email you as soon as there\u2019s an update. Keep your ticket number handy for reference.') +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nYour support ticket has been created.\nTicket: {{ticketNumber}}\nSubject: {{title}}\nStatus: Open\n\nOur team will review it and get back to you soon.\n\n— The SkillBee Support Team',
    variables: ['studentName', 'ticketNumber', 'title', 'message', 'email'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'support_ticket_reply',
    name: 'Support Ticket Reply',
    subject: 'New reply on your ticket — {{ticketNumber}}',
    htmlBody: brandedEmail({
      preheader: 'Our team replied to your ticket {{ticketNumber}}.',
      eyebrow: 'Support',
      heading: 'New reply on your ticket',
      bodyHtml:
        greeting() +
        p('Our support team has responded to your request. Here\u2019s the latest update:') +
        detailTable([
          { label: 'Ticket number', value: '{{ticketNumber}}' },
          { label: 'Subject', value: '{{title}}' },
        ]) +
        p('{{message}}') +
        muted('Sign in to your dashboard to view the full conversation and reply.') +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nOur team replied to your ticket {{ticketNumber}} ({{title}}).\n\n{{message}}\n\nSign in to your dashboard to view the full conversation.\n\n— The SkillBee Support Team',
    variables: ['studentName', 'ticketNumber', 'title', 'message', 'email'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'support_ticket_status',
    name: 'Support Ticket Status Update',
    subject: 'Ticket {{ticketNumber}} status updated',
    htmlBody: brandedEmail({
      preheader: 'Your ticket {{ticketNumber}} is now {{newStatus}}.',
      eyebrow: 'Support',
      heading: 'Ticket status updated',
      bodyHtml:
        greeting() +
        p('There\u2019s an update on your support request:') +
        detailTable([
          { label: 'Ticket number', value: '{{ticketNumber}}' },
          { label: 'Subject', value: '{{title}}' },
          { label: 'Status', value: '{{previousStatus}} &rarr; {{newStatus}}' },
        ]) +
        p('{{message}}') +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nYour ticket {{ticketNumber}} ({{title}}) status changed from {{previousStatus}} to {{newStatus}}.\n\n{{message}}\n\n— The SkillBee Support Team',
    variables: ['studentName', 'ticketNumber', 'title', 'previousStatus', 'newStatus', 'message', 'email'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'contact_enquiry_received',
    name: 'Contact Enquiry Received',
    subject: 'We\u2019ve received your enquiry',
    htmlBody: brandedEmail({
      preheader: 'Your enquiry has been received — reference {{enquiryNumber}}.',
      eyebrow: 'Enquiry',
      heading: 'We\u2019ve received your enquiry',
      bodyHtml:
        greeting() +
        p('Thank you for contacting SkillBee. Your enquiry has been logged and our team will get back to you as soon as possible.') +
        detailTable([
          { label: 'Reference', value: '{{enquiryNumber}}' },
          { label: 'Subject', value: '{{title}}' },
        ]) +
        muted('Please keep your reference number handy — it helps us locate your enquiry quickly.') +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nThank you for contacting us. Your enquiry has been received.\nReference: {{enquiryNumber}}\nSubject: {{title}}\n\nOur team will review it and respond soon.\n\n— The SkillBee Team',
    variables: ['studentName', 'enquiryNumber', 'title', 'message', 'email'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'instructor_application_status',
    name: 'Instructor Application Status Update',
    subject: 'Application {{applicationNumber}} — {{newStatus}}',
    htmlBody: brandedEmail({
      preheader: 'Your instructor application {{applicationNumber}} is now {{newStatus}}.',
      eyebrow: 'Application',
      heading: 'Application status updated',
      bodyHtml:
        greeting() +
        p('There\u2019s an update on your instructor application:') +
        detailTable([
          { label: 'Application', value: '{{applicationNumber}}' },
          { label: 'Course', value: '{{courseName}}' },
          { label: 'Status', value: '{{previousStatus}} &rarr; {{newStatus}}' },
        ]) +
        p('{{message}}') +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nYour instructor application {{applicationNumber}} for {{courseName}} changed from {{previousStatus}} to {{newStatus}}.\n\n{{message}}\n\n— The SkillBee Team',
    variables: ['studentName', 'applicationNumber', 'courseName', 'previousStatus', 'newStatus', 'message', 'email'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
  {
    slug: 'contact_enquiry_reply',
    name: 'Contact Enquiry Reply',
    subject: 'Re: {{title}} — {{enquiryNumber}}',
    htmlBody: brandedEmail({
      preheader: 'Our team replied to your enquiry {{enquiryNumber}}.',
      eyebrow: 'Enquiry',
      heading: 'Reply to your enquiry',
      bodyHtml:
        greeting() +
        p('Our team has responded to your enquiry. Here\u2019s the latest message:') +
        detailTable([
          { label: 'Reference', value: '{{enquiryNumber}}' },
          { label: 'Subject', value: '{{title}}' },
        ]) +
        p('{{message}}') +
        muted('If you have more questions, simply reply to this email.') +
        signOff(),
    }),
    textBody:
      'Hi {{studentName}},\n\nOur team replied to your enquiry {{enquiryNumber}} ({{title}}).\n\n{{message}}\n\n— The SkillBee Team',
    variables: ['studentName', 'enquiryNumber', 'title', 'message', 'email'],
    designVersion: EMAIL_DESIGN_VERSION,
  },
];
