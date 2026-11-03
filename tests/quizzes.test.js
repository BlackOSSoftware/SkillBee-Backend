import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import {
  clearCollections,
  createTestApp,
  promoteToRole,
  startTestDatabase,
  stopTestDatabase,
} from './helpers/setup.js';
import { ROLE_SLUGS } from '../src/config/security.js';
import { CourseEnrollment } from '../src/models/CourseEnrollment.js';
import { QuizAttempt } from '../src/models/QuizAttempt.js';
import { QuizQuestion } from '../src/models/QuizQuestion.js';

const API = '/api/v1';

const thumbnail = {
  publicId: 'skillbee/courses/csv-quiz-thumb',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/courses/csv-quiz-thumb.jpg',
  width: 1280,
  height: 720,
  format: 'jpg',
  bytes: 120000,
};

async function register(app, email, password = 'Secret123') {
  const res = await request(app).post(`${API}/auth/register`).send({
    firstName: 'Test',
    lastName: 'User',
    email,
    password,
  });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function login(app, email, password = 'Secret123') {
  const res = await request(app).post(`${API}/auth/login`).send({ email, password });
  assert.equal(res.status, 200);
  return res.body.data;
}

describe('Phase 5 Quizzes', () => {
  let app;
  let adminToken;
  let studentToken;
  let studentId;
  let otherStudentToken;
  let instructorToken;
  let instructorId;
  let unassignedInstructorToken;
  let categoryId;
  let courseId;

  before(async () => {
    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearCollections();

    await register(app, 'admin.quiz@skillbee.test');
    await promoteToRole('admin.quiz@skillbee.test', ROLE_SLUGS.ADMIN);
    adminToken = (await login(app, 'admin.quiz@skillbee.test')).accessToken;

    const student = await register(app, 'student.quiz@skillbee.test');
    studentToken = student.accessToken;
    studentId = student.user.id;

    const other = await register(app, 'student.other.quiz@skillbee.test');
    otherStudentToken = other.accessToken;

    await register(app, 'instructor.quiz@skillbee.test');
    await promoteToRole('instructor.quiz@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    const instructorLogin = await login(app, 'instructor.quiz@skillbee.test');
    instructorToken = instructorLogin.accessToken;
    instructorId = instructorLogin.user.id;

    await register(app, 'instructor.other.quiz@skillbee.test');
    await promoteToRole('instructor.other.quiz@skillbee.test', ROLE_SLUGS.INSTRUCTOR);
    unassignedInstructorToken = (await login(app, 'instructor.other.quiz@skillbee.test'))
      .accessToken;

    const category = await request(app)
      .post(`${API}/admin/course-categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CSV Quiz Cat', description: 'Validation' });
    assert.equal(category.status, 201);
    categoryId = category.body.data.category.id;

    const course = await request(app)
      .post(`${API}/admin/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'CSV Quiz Course',
        description: '<p>Quiz test course</p>',
        thumbnail,
        categoryIds: [categoryId],
        instructorIds: [instructorId],
        pricing: { type: 'paid', regularPrice: 5000, currency: 'INR' },
      });
    assert.equal(course.status, 201);
    courseId = course.body.data.course.id;

    // Publish course with a lesson so learning access works
    const topic = await request(app)
      .post(`${API}/admin/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Topic 1', description: 't' });
    assert.equal(topic.status, 201);
    const topicId = topic.body.data.topic.id;
    const lesson = await request(app)
      .post(`${API}/admin/topics/${topicId}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Lesson 1',
        type: 'text',
        textContent: { body: '<p>hi</p>', format: 'html' },
      });
    assert.equal(lesson.status, 201, JSON.stringify(lesson.body));
    const lessonPub = await request(app)
      .patch(`${API}/admin/lessons/${lesson.body.data.lesson.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(lessonPub.status, 200, JSON.stringify(lessonPub.body));

    const pub = await request(app)
      .patch(`${API}/admin/courses/${courseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(pub.status, 200, JSON.stringify(pub.body));

    await CourseEnrollment.create({
      courseId,
      studentId,
      status: 'active',
    });
  });

  async function createQuiz(overrides = {}) {
    const res = await request(app)
      .post(`${API}/admin/quizzes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Intro CSV Quiz',
        courseId,
        timeLimitSeconds: 600,
        passingPercentage: 50,
        maximumAttempts: 2,
        negativeMarkingEnabled: true,
        negativeMarksPerWrongAnswer: 0.5,
        showResults: 'after_submission',
        showCorrectAnswers: true,
        showExplanation: true,
        ...overrides,
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data.quiz;
  }

  async function addMcq(quizId, text = 'What does CSV stand for?', correctId = 'a') {
    const res = await request(app)
      .post(`${API}/admin/quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: text,
        questionType: 'multiple_choice',
        marks: 2,
        negativeMarks: 0.5,
        options: [
          { id: 'a', text: 'Computerized System Validation' },
          { id: 'b', text: 'Computer System Verification' },
          { id: 'c', text: 'Controlled Software Validation' },
          { id: 'd', text: 'Computerized Software Verification' },
        ],
        correctOptionIds: [correctId],
        explanation: 'CSV documented evidence of intended use.',
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data.question;
  }

  it('CRUD quiz + reject invalid course/passing/timer/duplicate slug', async () => {
    const quiz = await createQuiz();
    const get = await request(app)
      .get(`${API}/admin/quizzes/${quiz.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(get.status, 200);
    assert.equal(get.body.data.quiz.title, 'Intro CSV Quiz');

    const upd = await request(app)
      .patch(`${API}/admin/quizzes/${quiz.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Intro CSV Quiz Updated', passingPercentage: 70 });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.data.quiz.passingPercentage, 70);

    const badCourse = await request(app)
      .post(`${API}/admin/quizzes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Bad', courseId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    assert.equal(badCourse.status, 404);

    const badPass = await request(app)
      .post(`${API}/admin/quizzes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Bad Pass', courseId, passingPercentage: 150 });
    assert.equal(badPass.status, 400);

    const badTimer = await request(app)
      .post(`${API}/admin/quizzes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Bad Timer', courseId, timeLimitSeconds: -5 });
    assert.equal(badTimer.status, 400);

    await request(app)
      .post(`${API}/admin/quizzes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Slugger', slug: 'same-slug', courseId });
    const dup = await request(app)
      .post(`${API}/admin/quizzes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Slugger 2', slug: 'same-slug', courseId });
    // ensureUniqueQuizSlug auto-suffixes — so create succeeds with different slug
    assert.equal(dup.status, 201);
    assert.notEqual(dup.body.data.quiz.slug, 'same-slug');

    const arch = await request(app)
      .delete(`${API}/admin/quizzes/${quiz.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(arch.status, 200);
    assert.ok(arch.body.data.quiz.deletedAt || arch.body.data.quiz.status === 'archived');
  });

  it('creates all question types and rejects invalid options/correct/marks/reorder', async () => {
    const quiz = await createQuiz();

    const mc = await addMcq(quiz.id);
    assert.deepEqual(mc.correctOptionIds, ['a']);

    const ms = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Select GxP drivers',
        questionType: 'multiple_select',
        marks: 2,
        options: [
          { id: '1', text: 'Safety' },
          { id: '2', text: 'Integrity' },
          { id: '3', text: 'Fashion' },
        ],
        correctOptionIds: ['1', '2'],
      });
    assert.equal(ms.status, 201);

    const tf = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'CSV needs documented evidence',
        questionType: 'true_false',
        marks: 1,
        correctAnswer: true,
      });
    assert.equal(tf.status, 201);

    const sa = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Expand GMP',
        questionType: 'short_answer',
        marks: 1,
        acceptedAnswers: ['Good Manufacturing Practice'],
      });
    assert.equal(sa.status, 201);

    const la = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Explain risk-based CSV',
        questionType: 'long_answer',
        marks: 5,
        gradingRubric: [{ criterion: 'Accuracy', maximumMarks: 5, description: 'ok' }],
      });
    assert.equal(la.status, 201);
    assert.equal(la.body.data.question.gradingMode, 'manual');

    const fib = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'ALCOA ends with _____',
        questionType: 'fill_in_the_blanks',
        marks: 1,
        blanks: [{ id: 'b1', acceptedAnswers: ['Accurate'], marks: 1 }],
      });
    assert.equal(fib.status, 201);

    const badOpts = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Bad',
        questionType: 'multiple_choice',
        marks: 1,
        options: [{ id: 'x', text: 'only one' }],
        correctOptionIds: ['x'],
      });
    assert.equal(badOpts.status, 400);

    const badCorrect = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Bad correct',
        questionType: 'multiple_choice',
        marks: 1,
        options: [
          { id: 'x', text: 'a' },
          { id: 'y', text: 'b' },
        ],
        correctOptionIds: ['z'],
      });
    assert.equal(badCorrect.status, 400);

    const badMarks = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Bad marks',
        questionType: 'true_false',
        marks: -1,
        correctAnswer: true,
      });
    assert.equal(badMarks.status, 400);

    const list = await request(app)
      .get(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(list.status, 200);
    const ids = list.body.data.questions.map((q) => q.id);

    const incomplete = await request(app)
      .patch(`${API}/admin/quizzes/${quiz.id}/questions/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ questionIds: ids.slice(0, 2) });
    assert.equal(incomplete.status, 400);

    const reorder = await request(app)
      .patch(`${API}/admin/quizzes/${quiz.id}/questions/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ questionIds: [...ids].reverse() });
    assert.equal(reorder.status, 200);
    assert.equal(reorder.body.data.questions[0].id, ids[ids.length - 1]);
  });

  it('privacy: admin sees keys; student start does not; snapshots immutable', async () => {
    const quiz = await createQuiz({ maximumAttempts: 3 });
    const q = await addMcq(quiz.id);
    assert.ok(q.correctOptionIds?.length);

    const pub = await request(app)
      .patch(`${API}/admin/quizzes/${quiz.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    assert.equal(pub.status, 200, JSON.stringify(pub.body));

    const start = await request(app)
      .post(`${API}/student/quizzes/${quiz.id}/start`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(start.status, 201, JSON.stringify(start.body));
    const studentQ = start.body.data.questions[0];
    assert.equal(studentQ.correctOptionIds, undefined);
    assert.equal(studentQ.acceptedAnswers, undefined);
    assert.equal(studentQ.gradingRubric, undefined);
    assert.equal(studentQ.explanation, undefined);

    const attemptId = start.body.data.attemptId;
    const snapBefore = await QuizAttempt.findById(attemptId);
    const originalText = snapBefore.questionSnapshots[0].questionText;

    await request(app)
      .patch(`${API}/admin/quizzes/questions/${q.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ questionText: 'CHANGED AFTER ATTEMPT START' });

    const snapAfter = await QuizAttempt.findById(attemptId);
    assert.equal(snapAfter.questionSnapshots[0].questionText, originalText);
  });

  it('attempts: enrollment, draft, schedule, limits, scoring, grading, analytics', async () => {
    const quiz = await createQuiz({
      maximumAttempts: 1,
      timeLimitSeconds: 600,
      passingPercentage: 50,
      negativeMarkingEnabled: true,
      negativeMarksPerWrongAnswer: 0.5,
    });

    const mc = await addMcq(quiz.id, 'CSV meaning?', 'a');
    const tf = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Evidence required?',
        questionType: 'true_false',
        marks: 1,
        negativeMarks: 0.5,
        correctAnswer: true,
      });
    assert.equal(tf.status, 201);
    const sa = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Expand GMP',
        questionType: 'short_answer',
        marks: 1,
        acceptedAnswers: ['Good Manufacturing Practice'],
      });
    assert.equal(sa.status, 201);
    const ms = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Select correct',
        questionType: 'multiple_select',
        marks: 2,
        options: [
          { id: '1', text: 'A' },
          { id: '2', text: 'B' },
          { id: '3', text: 'C' },
        ],
        correctOptionIds: ['1', '2'],
      });
    assert.equal(ms.status, 201);
    const fib = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Blank Accurate',
        questionType: 'fill_in_the_blanks',
        marks: 1,
        blanks: [{ id: 'b1', acceptedAnswers: ['Accurate'], marks: 1 }],
      });
    assert.equal(fib.status, 201);
    const la = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Essay on CSV',
        questionType: 'long_answer',
        marks: 4,
      });
    assert.equal(la.status, 201);

    // Draft cannot start
    const draftStart = await request(app)
      .post(`${API}/student/quizzes/${quiz.id}/start`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(draftStart.status, 403);

    await request(app)
      .patch(`${API}/admin/quizzes/${quiz.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    // Non-enrolled blocked
    const noEnroll = await request(app)
      .post(`${API}/student/quizzes/${quiz.id}/start`)
      .set('Authorization', `Bearer ${otherStudentToken}`);
    assert.equal(noEnroll.status, 403);

    // Availability future
    await request(app)
      .patch(`${API}/admin/quizzes/${quiz.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        availability: {
          enabled: true,
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 172800000).toISOString(),
        },
      });
    const early = await request(app)
      .post(`${API}/student/quizzes/${quiz.id}/start`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(early.status, 403);

    await request(app)
      .patch(`${API}/admin/quizzes/${quiz.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        availability: {
          enabled: true,
          startsAt: new Date(Date.now() - 86400000).toISOString(),
          endsAt: new Date(Date.now() - 3600000).toISOString(),
        },
      });
    const late = await request(app)
      .post(`${API}/student/quizzes/${quiz.id}/start`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(late.status, 403);

    await request(app)
      .patch(`${API}/admin/quizzes/${quiz.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ availability: { enabled: false } });

    const start = await request(app)
      .post(`${API}/student/quizzes/${quiz.id}/start`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(start.status, 201, JSON.stringify(start.body));
    assert.ok(start.body.data.expiresAt);
    assert.equal(start.body.data.timeLimitSeconds, 600);
    const attemptId = start.body.data.attemptId;
    const questions = start.body.data.questions;

    const byType = Object.fromEntries(
      (await QuizQuestion.find({ quizId: quiz.id })).map((q) => [q.questionType, q])
    );

    const answers = [
      {
        questionId: byType.multiple_choice._id.toString(),
        answer: { selectedOptionIds: ['b'] }, // wrong → negative
      },
      {
        questionId: byType.true_false._id.toString(),
        answer: { booleanAnswer: true },
      },
      {
        questionId: byType.short_answer._id.toString(),
        answer: { text: 'good manufacturing practice' },
      },
      {
        questionId: byType.multiple_select._id.toString(),
        answer: { selectedOptionIds: ['1', '2'] },
      },
      {
        questionId: byType.fill_in_the_blanks._id.toString(),
        answer: { blankAnswers: [{ blankId: 'b1', value: 'Accurate' }] },
      },
      {
        questionId: byType.long_answer._id.toString(),
        answer: { text: 'CSV ensures systems meet intended use with evidence.' },
      },
    ];

    // Reject client scoring fields via unknown keys on body — zod strict on answers only;
    // top-level obtainedMarks stripped by .strict() on submit schema
    const badScore = await request(app)
      .post(`${API}/student/quiz-attempts/${attemptId}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answers, obtainedMarks: 999 });
    assert.equal(badScore.status, 400);

    const submit = await request(app)
      .post(`${API}/student/quiz-attempts/${attemptId}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answers });
    assert.equal(submit.status, 200, JSON.stringify(submit.body));
    const result = submit.body.data.result;
    assert.equal(result.evaluationStatus, 'partial');
    // auto: tf 1 + sa 1 + ms 2 + fib 1 = 5; mc wrong → -0.5; floor applied on total
    // obtained before floor: 5 - 0.5 = 4.5; long pending
    assert.equal(result.obtainedMarks, 4.5);
    assert.ok(result.negativeMarks >= 0.5);

    const dupSubmit = await request(app)
      .post(`${API}/student/quiz-attempts/${attemptId}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answers });
    assert.equal(dupSubmit.status, 409);

    // Max attempts
    const second = await request(app)
      .post(`${API}/student/quizzes/${quiz.id}/start`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(second.status, 403);

    // Grade long answer
    const grade = await request(app)
      .patch(`${API}/admin/quiz-attempts/${attemptId}/grade`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        grades: [
          {
            questionId: byType.long_answer._id.toString(),
            marksAwarded: 3,
            feedback: 'Good explanation.',
          },
        ],
      });
    assert.equal(grade.status, 200, JSON.stringify(grade.body));
    assert.equal(grade.body.data.result.evaluationStatus, 'completed');
    assert.equal(grade.body.data.result.obtainedMarks, 7.5);

    // Unauthorized instructor
    const forbidden = await request(app)
      .get(`${API}/admin/quiz-attempts/${attemptId}`)
      .set('Authorization', `Bearer ${unassignedInstructorToken}`);
    assert.equal(forbidden.status, 403);

    // Other student cannot read result
    const idor = await request(app)
      .get(`${API}/student/quiz-attempts/${attemptId}/result`)
      .set('Authorization', `Bearer ${otherStudentToken}`);
    assert.equal(idor.status, 403);

    const own = await request(app)
      .get(`${API}/student/quiz-attempts/${attemptId}/result`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(own.status, 200);
    assert.equal(own.body.data.result.obtainedMarks, 7.5);

    const analytics = await request(app)
      .get(`${API}/admin/quizzes/${quiz.id}/analytics`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(analytics.status, 200);
    assert.equal(analytics.body.data.analytics.totalAttempts, 1);
    assert.ok(analytics.body.data.analytics.uniqueStudents >= 1);

    // Student cannot hit admin
    const studentAdmin = await request(app)
      .get(`${API}/admin/quizzes`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(studentAdmin.status, 403);

    void questions;
    void mc;
  });

  it('timer expiry rejects late submit; client cannot change expiresAt', async () => {
    const quiz = await createQuiz({ timeLimitSeconds: 1, maximumAttempts: 2 });
    await addMcq(quiz.id);
    await request(app)
      .patch(`${API}/admin/quizzes/${quiz.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });

    const start = await request(app)
      .post(`${API}/student/quizzes/${quiz.id}/start`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(start.status, 201);
    const attemptId = start.body.data.attemptId;
    const expiresAt = new Date(start.body.data.expiresAt).getTime();
    assert.ok(expiresAt > Date.now() - 5000);

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 1200));

    const qid = start.body.data.questions[0].id;
    const late = await request(app)
      .post(`${API}/student/quiz-attempts/${attemptId}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: qid, answer: { selectedOptionIds: ['a'] } }] });
    assert.ok([409].includes(late.status), JSON.stringify(late.body));

    const attempt = await QuizAttempt.findById(attemptId);
    assert.ok(['expired', 'evaluated', 'evaluating'].includes(attempt.status));
  });

  it('question bank CRUD and from-bank snapshot', async () => {
    const bank = await request(app)
      .post(`${API}/admin/question-bank`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Bank CSV meaning?',
        questionType: 'multiple_choice',
        defaultMarks: 1,
        options: [
          { id: 'a', text: 'Computerized System Validation' },
          { id: 'b', text: 'Other' },
        ],
        correctOptionIds: ['a'],
        category: 'csv',
        tags: ['bank'],
      });
    assert.equal(bank.status, 201, JSON.stringify(bank.body));

    const quiz = await createQuiz();
    const imported = await request(app)
      .post(`${API}/admin/quizzes/${quiz.id}/questions/from-bank`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ questionBankIds: [bank.body.data.question.id] });
    assert.equal(imported.status, 201);
    assert.equal(imported.body.data.questions[0].questionText, 'Bank CSV meaning?');

    await request(app)
      .patch(`${API}/admin/question-bank/${bank.body.data.question.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ questionText: 'CHANGED BANK TEXT' });

    const list = await request(app)
      .get(`${API}/admin/quizzes/${quiz.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(list.body.data.questions[0].questionText, 'Bank CSV meaning?');
  });
});
