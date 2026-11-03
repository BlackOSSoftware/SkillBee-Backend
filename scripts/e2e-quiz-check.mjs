/**
 * Live Phase 5 quiz verification against a running API + MongoDB.
 * Uses real HTTP calls. Does not invent analytics.
 */
import dotenv from 'dotenv';

dotenv.config();

const BASE = process.env.API_BASE || 'http://127.0.0.1:5000/api/v1';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SUPER_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SUPER_ADMIN_PASSWORD;
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL || 'student.quiz.e2e@skillbee.local';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD || 'Secret123!';

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (or SEED_SUPER_ADMIN_*)');
  process.exit(1);
}

async function api(method, urlPath, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('E2E quiz check', BASE);

  const login = await api('POST', '/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assert(login.status === 200, `admin login ${login.status}`);
  const adminToken = login.json.data.accessToken;

  // Prefer existing demo / any course (published preferred)
  const courses = await api('GET', '/admin/courses?limit=20', { token: adminToken });
  assert(courses.status === 200, `list courses ${courses.status}`);
  const list = courses.json.data?.courses || courses.json.data || [];
  const preferred =
    list.find((c) => c.slug === 'computerized-system-validation-csv-csa-demo') ||
    list.find((c) => c.status === 'published') ||
    list[0];
  let courseId = preferred?.id;
  if (!courseId) {
    const cats = await api('GET', '/admin/course-categories', { token: adminToken });
    const catList = cats.json.data?.categories || cats.json.data || [];
    const categoryId = catList[0]?.id;
    assert(categoryId, 'need a category — run seed:curriculum');
    const created = await api('POST', '/admin/courses', {
      token: adminToken,
      body: {
        title: `E2E Quiz Course ${Date.now()}`,
        description: '<p>E2E quiz course</p>',
        thumbnail: {
          publicId: 'skillbee/e2e/quiz',
          secureUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        },
        categoryIds: [categoryId],
        pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
      },
    });
    assert(created.status === 201, `create course ${created.status}`);
    courseId = created.json.data.course.id;
  }
  console.log('Using course', courseId);

  // Ensure course is published for student eligibility
  const courseStatus = await api('PATCH', `/admin/courses/${courseId}/status`, {
    token: adminToken,
    body: { status: 'published' },
  });
  if (courseStatus.status !== 200) {
    console.warn('Could not publish course:', courseStatus.status, JSON.stringify(courseStatus.json));
  }

  console.log('1) Create quiz');
  const quizRes = await api('POST', '/admin/quizzes', {
    token: adminToken,
    body: {
      title: `E2E CSV Quiz ${Date.now()}`,
      courseId,
      timeLimitSeconds: 900,
      passingPercentage: 50,
      maximumAttempts: 2,
      negativeMarkingEnabled: true,
      negativeMarksPerWrongAnswer: 0.25,
      randomizeQuestions: true,
      showResults: 'after_submission',
      showCorrectAnswers: true,
      showExplanation: true,
    },
  });
  assert(quizRes.status === 201, `create quiz ${quizRes.status} ${JSON.stringify(quizRes.json)}`);
  const quizId = quizRes.json.data.quiz.id;

  console.log('2) Add question types');
  const questions = [];
  const payloads = [
    {
      questionText: 'What does CSV stand for?',
      questionType: 'multiple_choice',
      marks: 2,
      negativeMarks: 0.25,
      options: [
        { id: 'a', text: 'Computerized System Validation' },
        { id: 'b', text: 'Computer System Verification' },
        { id: 'c', text: 'Controlled Software Validation' },
        { id: 'd', text: 'Computerized Software Verification' },
      ],
      correctOptionIds: ['a'],
      explanation: 'CSV establishes documented evidence of intended use.',
    },
    {
      questionText: 'Select data integrity drivers',
      questionType: 'multiple_select',
      marks: 2,
      options: [
        { id: '1', text: 'ALCOA+' },
        { id: '2', text: 'Audit trails' },
        { id: '3', text: 'Shared passwords' },
      ],
      correctOptionIds: ['1', '2'],
    },
    {
      questionText: 'Documented evidence is required for CSV',
      questionType: 'true_false',
      marks: 1,
      correctAnswer: true,
    },
    {
      questionText: 'Expand GMP',
      questionType: 'short_answer',
      marks: 1,
      acceptedAnswers: ['Good Manufacturing Practice'],
    },
    {
      questionText: 'Explain why validation matters',
      questionType: 'long_answer',
      marks: 4,
    },
    {
      questionText: 'ALCOA Accurate blank',
      questionType: 'fill_in_the_blanks',
      marks: 1,
      blanks: [{ id: 'b1', acceptedAnswers: ['Accurate'], marks: 1 }],
    },
  ];

  for (const p of payloads) {
    const r = await api('POST', `/admin/quizzes/${quizId}/questions`, {
      token: adminToken,
      body: p,
    });
    assert(r.status === 201, `add ${p.questionType} ${r.status} ${JSON.stringify(r.json)}`);
    questions.push(r.json.data.question);
  }

  console.log('3) Publish quiz');
  const pub = await api('PATCH', `/admin/quizzes/${quizId}/status`, {
    token: adminToken,
    body: { status: 'published' },
  });
  assert(pub.status === 200, `publish ${pub.status} ${JSON.stringify(pub.json)}`);

  // Ensure student exists + enrolled
  let studentLogin = await api('POST', '/auth/login', {
    body: { email: STUDENT_EMAIL, password: STUDENT_PASSWORD },
  });
  if (studentLogin.status !== 200) {
    await api('POST', '/auth/register', {
      body: {
        firstName: 'E2E',
        lastName: 'Student',
        email: STUDENT_EMAIL,
        password: STUDENT_PASSWORD,
      },
    });
    studentLogin = await api('POST', '/auth/login', {
      body: { email: STUDENT_EMAIL, password: STUDENT_PASSWORD },
    });
  }
  assert(studentLogin.status === 200, 'student login');
  const studentToken = studentLogin.json.data.accessToken;
  const studentId = studentLogin.json.data.user.id;

  console.log('4) Ensure enrollment + start as student');
  {
    const { default: mongoose } = await import('mongoose');
    const { CourseEnrollment } = await import('../src/models/CourseEnrollment.js');
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    await CourseEnrollment.findOneAndUpdate(
      { courseId, studentId, deletedAt: null },
      {
        $setOnInsert: {
          courseId,
          studentId,
          status: 'active',
          source: 'manual',
        },
      },
      { upsert: true, new: true }
    );
  }

  let start = await api('POST', `/student/quizzes/${quizId}/start`, { token: studentToken });
  assert(start.status === 201, `start ${start.status} ${JSON.stringify(start.json)}`);
  assert(!start.json.data.questions[0].correctOptionIds, 'privacy: no correctOptionIds');
  const attemptId = start.json.data.attemptId;

  console.log('5) Submit answers');
  const byType = Object.fromEntries(questions.map((q) => [q.questionType, q]));
  const submit = await api('POST', `/student/quiz-attempts/${attemptId}/submit`, {
    token: studentToken,
    body: {
      answers: [
        { questionId: byType.multiple_choice.id, answer: { selectedOptionIds: ['a'] } },
        { questionId: byType.multiple_select.id, answer: { selectedOptionIds: ['1', '2'] } },
        { questionId: byType.true_false.id, answer: { booleanAnswer: true } },
        {
          questionId: byType.short_answer.id,
          answer: { text: 'Good Manufacturing Practice' },
        },
        {
          questionId: byType.long_answer.id,
          answer: { text: 'Validation provides documented evidence for patient safety.' },
        },
        {
          questionId: byType.fill_in_the_blanks.id,
          answer: { blankAnswers: [{ blankId: 'b1', value: 'Accurate' }] },
        },
      ],
    },
  });
  assert(submit.status === 200, `submit ${submit.status} ${JSON.stringify(submit.json)}`);
  assert(submit.json.data.result.evaluationStatus === 'partial', 'long answer pending');

  console.log('6) Manual grade');
  const grade = await api('PATCH', `/admin/quiz-attempts/${attemptId}/grade`, {
    token: adminToken,
    body: {
      grades: [
        {
          questionId: byType.long_answer.id,
          marksAwarded: 3,
          feedback: 'Solid rationale.',
        },
      ],
    },
  });
  assert(grade.status === 200, `grade ${grade.status}`);
  assert(grade.json.data.result.evaluationStatus === 'completed');

  console.log('7) Analytics');
  const analytics = await api('GET', `/admin/quizzes/${quizId}/analytics`, {
    token: adminToken,
  });
  assert(analytics.status === 200, 'analytics');
  assert(analytics.json.data.analytics.totalAttempts >= 1);

  console.log('8) Unauthorized student admin access');
  const denied = await api('GET', '/admin/quizzes', { token: studentToken });
  assert(denied.status === 403, 'student blocked from admin');

  console.log('E2E quiz check PASSED');
  console.log(
    JSON.stringify(
      {
        quizId,
        attemptId,
        studentId,
        obtainedMarks: grade.json.data.result.obtainedMarks,
        percentage: grade.json.data.result.percentage,
        analytics: analytics.json.data.analytics,
      },
      null,
      2
    )
  );

  try {
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(0);
}

main().catch(async (err) => {
  console.error('E2E quiz check FAILED', err);
  try {
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
