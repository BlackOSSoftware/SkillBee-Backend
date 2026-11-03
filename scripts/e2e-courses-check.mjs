/**
 * Live Phase 2 course API check with real SkillBee content (MongoDB Atlas).
 * Usage: node scripts/e2e-courses-check.mjs
 */
import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Blob } from 'buffer';

const BASE = `http://localhost:${process.env.PORT || 5000}/api/v1`;
const stamp = Date.now();
const results = [];

function ok(step, detail = '') {
  results.push({ step, pass: true, detail });
  console.log(`✅ ${step}${detail ? ` — ${detail}` : ''}`);
}

function fail(step, detail) {
  results.push({ step, pass: false, detail });
  console.error(`❌ ${step} — ${detail}`);
}

async function req(method, pathName, { token, body, formData, expectStatus } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !formData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${pathName}`, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (expectStatus != null && res.status !== expectStatus) {
    throw new Error(
      `${method} ${pathName} expected ${expectStatus}, got ${res.status}: ${JSON.stringify(data)}`
    );
  }

  return { status: res.status, data };
}

const thumbnail = {
  provider: 'cloudinary',
  publicId: 'skillbee/courses/nodejs-backend-mastery',
  secureUrl:
    'https://res.cloudinary.com/demo/image/upload/w_1280,h_720,c_fill/sample.jpg',
  width: 1280,
  height: 720,
  format: 'jpg',
  bytes: 185000,
};

async function main() {
  console.log(`\n🔍 Skillbee Course API live check → ${BASE}\n`);

  // Health
  {
    const health = await fetch(`http://localhost:${process.env.PORT || 5000}/health`);
    const data = await health.json();
    if (health.ok && data?.data?.status === 'ok') ok('GET /health');
    else {
      fail('GET /health', JSON.stringify(data));
      process.exit(1);
    }
  }

  // Admin login
  let adminToken;
  {
    const { data } = await req('POST', '/auth/login', {
      body: {
        email: process.env.SEED_SUPER_ADMIN_EMAIL || 'admin@skillbee.local',
        password: process.env.SEED_SUPER_ADMIN_PASSWORD || 'ChangeMe123',
      },
      expectStatus: 200,
    });
    adminToken = data.data.accessToken;
    ok('Admin login', `${data.data.user.email} / ${data.data.user.role?.slug}`);
  }

  // Ensure instructor exists
  let instructorId;
  const instructorEmail = `rahul.instructor.${stamp}@skillbee.in`;
  {
    // Register then promote via admin create with instructor role, or register + patch role
    const roles = await req('GET', '/admin/roles', { token: adminToken, expectStatus: 200 });
    const instructorRole = roles.data.data.roles.find((r) => r.slug === 'instructor');
    if (!instructorRole) throw new Error('instructor role missing — run npm run seed:roles');

    const created = await req('POST', '/admin/users', {
      token: adminToken,
      body: {
        firstName: 'Rahul',
        lastName: 'Iyer',
        email: instructorEmail,
        phone: '+91 98765 11122',
        password: 'RahulSecure1',
        roleId: instructorRole.id,
        emailVerified: true,
        profile: {
          title: 'Senior Backend Instructor',
          expertise: ['Node.js', 'MongoDB', 'System Design'],
          yearsExperience: 9,
        },
      },
      expectStatus: 201,
    });
    instructorId = created.data.data.user.id;
    ok('Create instructor user', `${created.data.data.user.firstName} ${created.data.data.user.lastName}`);
  }

  // Instructors APIs
  {
    const list = await req('GET', '/admin/instructors?search=Rahul', {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET /admin/instructors', `found=${list.data.data.length}`);

    const one = await req('GET', `/admin/instructors/${instructorId}`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET /admin/instructors/:id', one.data.data.instructor.email);
  }

  // Categories CRUD
  let categoryId;
  let childCategoryId;
  {
    const created = await req('POST', '/admin/course-categories', {
      token: adminToken,
      body: {
        name: 'Software Engineering',
        description:
          'Career tracks for full-stack, backend, and cloud engineering at SkillBee.',
        seo: {
          metaTitle: 'Software Engineering Courses | SkillBee',
          metaDescription: 'Industry-ready software engineering programs',
        },
      },
      expectStatus: 201,
    });
    categoryId = created.data.data.category.id;
    ok('POST /admin/course-categories', created.data.data.category.slug);

    const child = await req('POST', '/admin/course-categories', {
      token: adminToken,
      body: {
        name: 'Backend Development',
        parentCategoryId: categoryId,
        description: 'APIs, databases, authentication, and deployment.',
      },
      expectStatus: 201,
    });
    childCategoryId = child.data.data.category.id;
    ok('POST child category', child.data.data.category.slug);

    const updated = await req('PATCH', `/admin/course-categories/${categoryId}`, {
      token: adminToken,
      body: {
        description:
          'Updated: SkillBee software engineering paths for working professionals in India.',
      },
      expectStatus: 200,
    });
    ok('PATCH category', updated.data.data.category.description.slice(0, 50));

    const listed = await req('GET', '/admin/course-categories?search=Software', {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET /admin/course-categories', `total=${listed.data.pagination.total}`);

    const pub = await req('GET', '/course-categories', { expectStatus: 200 });
    ok('GET /course-categories (public)', `count=${pub.data.data.categories.length}`);
  }

  // Course create
  let courseId;
  let courseSlug;
  {
    const created = await req('POST', '/admin/courses', {
      token: adminToken,
      body: {
        title: 'Node.js Backend Mastery with Express & MongoDB',
        shortDescription:
          'Build production REST APIs, JWT auth, RBAC, and deploy SkillBee-grade backends.',
        description: `<h2>What you will build</h2>
<p>A complete Node.js backend for an LMS: authentication, course modules, file uploads, and protected media.</p>
<ul>
  <li>Express architecture &amp; middleware</li>
  <li>MongoDB Atlas + Mongoose modeling</li>
  <li>JWT access/refresh and RBAC</li>
  <li>Course curriculum APIs</li>
</ul>`,
        thumbnail,
        gallery: [thumbnail],
        categoryIds: [categoryId, childCategoryId],
        instructorIds: [instructorId],
        level: 'intermediate',
        language: 'en',
        durationValue: 18,
        durationUnit: 'hours',
        isFeatured: true,
        learningObjectives: [
          {
            title: 'Design REST APIs',
            description: 'Versioned Express routes with Zod validation',
            sortOrder: 1,
          },
          {
            title: 'Secure auth',
            description: 'JWT + refresh rotation + RBAC permissions',
            sortOrder: 2,
          },
        ],
        requirements: [
          'Comfortable with JavaScript ES modules',
          'Basic HTTP and JSON knowledge',
        ],
        targetAudience: [
          'Aspiring backend developers',
          'Frontend engineers moving to full-stack',
        ],
        faqs: [
          {
            question: 'Is this course Hindi or English?',
            answer: 'Primary instruction is English with India-focused examples.',
            sortOrder: 1,
          },
        ],
        tags: ['nodejs', 'express', 'mongodb', 'jwt'],
        pricing: {
          type: 'paid',
          regularPrice: 7999,
          salePrice: 4999,
          currency: 'INR',
          taxConfiguration: { taxEnabled: true, taxClass: 'gst', taxInclusive: true },
        },
        seo: {
          metaTitle: 'Node.js Backend Mastery | SkillBee',
          metaDescription: 'Learn production Node.js backends with Express and MongoDB',
          focusKeyword: 'nodejs backend course',
        },
      },
      expectStatus: 201,
    });
    courseId = created.data.data.course.id;
    courseSlug = created.data.data.course.slug;
    ok('POST /admin/courses', `${created.data.data.course.title} [${courseSlug}]`);
  }

  // Course list / get / update
  {
    const listed = await req(
      'GET',
      `/admin/courses?search=Node.js&status=draft&instructorId=${instructorId}`,
      { token: adminToken, expectStatus: 200 }
    );
    ok('GET /admin/courses (filters)', `total=${listed.data.pagination.total}`);

    const one = await req('GET', `/admin/courses/${courseId}`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET /admin/courses/:id', `instructors=${one.data.data.course.instructorIds.length}`);

    const updated = await req('PATCH', `/admin/courses/${courseId}`, {
      token: adminToken,
      body: {
        shortDescription:
          'Updated: Ship SkillBee LMS APIs with auth, courses, curriculum, and media.',
        tags: ['nodejs', 'express', 'mongodb', 'jwt', 'rbac'],
      },
      expectStatus: 200,
    });
    ok('PATCH /admin/courses/:id', updated.data.data.course.shortDescription.slice(0, 48));
  }

  // Instructors assignment
  {
    const list = await req('GET', `/admin/courses/${courseId}/instructors`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET course instructors', list.data.data.instructors.map((i) => i.email).join(', '));

    const replaced = await req('PUT', `/admin/courses/${courseId}/instructors`, {
      token: adminToken,
      body: { instructorIds: [instructorId] },
      expectStatus: 200,
    });
    ok('PUT course instructors', `count=${replaced.data.data.course.instructorIds.length}`);
  }

  // Curriculum topics
  let topicId;
  let topic2Id;
  {
    const t1 = await req('POST', `/admin/courses/${courseId}/topics`, {
      token: adminToken,
      body: {
        title: 'Module 1 — Foundations',
        description: 'Node runtime, Express setup, project structure',
      },
      expectStatus: 201,
    });
    topicId = t1.data.data.topic.id;
    ok('POST topic', t1.data.data.topic.title);

    const t2 = await req('POST', `/admin/courses/${courseId}/topics`, {
      token: adminToken,
      body: {
        title: 'Module 2 — Auth & RBAC',
        description: 'JWT, refresh tokens, roles and permissions',
      },
      expectStatus: 201,
    });
    topic2Id = t2.data.data.topic.id;
    ok('POST second topic', t2.data.data.topic.title);

    const updated = await req('PATCH', `/admin/courses/${courseId}/topics/${topicId}`, {
      token: adminToken,
      body: {
        description: 'Updated: project bootstrap, env config, health checks',
      },
      expectStatus: 200,
    });
    ok('PATCH topic', updated.data.data.topic.description.slice(0, 40));

    const reordered = await req('PATCH', `/admin/courses/${courseId}/topics/reorder`, {
      token: adminToken,
      body: {
        items: [
          { id: topic2Id, sortOrder: 0 },
          { id: topicId, sortOrder: 1 },
        ],
      },
      expectStatus: 200,
    });
    ok('PATCH topics reorder', reordered.data.data.topics.map((t) => t.title).join(' → '));

    const listed = await req('GET', `/admin/courses/${courseId}/topics`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET topics', `count=${listed.data.data.topics.length}`);
  }

  // Lessons
  let lessonId;
  let videoLessonId;
  {
    const textLesson = await req('POST', `/admin/topics/${topicId}/lessons`, {
      token: adminToken,
      body: {
        title: 'Welcome to SkillBee Backend Track',
        type: 'text',
        description: 'Orientation and learning outcomes',
        content: {
          textContent: `<p>Welcome. By the end of this course you will ship a production-ready LMS API.</p>`,
        },
        isPreview: true,
        status: 'published',
      },
      expectStatus: 201,
    });
    lessonId = textLesson.data.data.lesson.id;
    ok('POST text lesson', textLesson.data.data.lesson.title);

    const videoLesson = await req('POST', `/admin/topics/${topicId}/lessons`, {
      token: adminToken,
      body: {
        title: 'Express App Bootstrap (Video)',
        type: 'video',
        description: 'Create the Express app, config, and health endpoint',
        status: 'published',
        isPreview: false,
      },
      expectStatus: 201,
    });
    videoLessonId = videoLesson.data.data.lesson.id;
    ok('POST video lesson', videoLesson.data.data.lesson.title);

    const updated = await req('PATCH', `/admin/lessons/${lessonId}`, {
      token: adminToken,
      body: {
        title: 'Welcome & Course Roadmap',
        durationSeconds: 420,
      },
      expectStatus: 200,
    });
    ok('PATCH lesson', updated.data.data.lesson.title);

    const moved = await req('POST', `/admin/lessons/${lessonId}/move`, {
      token: adminToken,
      body: { targetTopicId: topic2Id, sortOrder: 0 },
      expectStatus: 200,
    });
    ok('POST lesson move', `topic=${moved.data.data.lesson.topicId}`);

    // move back for curriculum coherence
    await req('POST', `/admin/lessons/${lessonId}/move`, {
      token: adminToken,
      body: { targetTopicId: topicId, sortOrder: 0 },
      expectStatus: 200,
    });

    const reordered = await req('PATCH', `/admin/topics/${topicId}/lessons/reorder`, {
      token: adminToken,
      body: {
        items: [
          { id: lessonId, sortOrder: 0 },
          { id: videoLessonId, sortOrder: 1 },
        ],
      },
      expectStatus: 200,
    });
    ok('PATCH lessons reorder', `count=${reordered.data.data.lessons.length}`);

    const one = await req('GET', `/admin/lessons/${videoLessonId}`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET lesson', one.data.data.lesson.title);
  }

  // Minimal real MP4 upload (tiny valid-ish file with video/mp4 mime via FormData)
  {
    const tmp = path.join(os.tmpdir(), `skillbee-demo-${stamp}.mp4`);
    // Tiny placeholder bytes — MIME validated; processing marked ready in non-production
    fs.writeFileSync(tmp, Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]));
    const form = new FormData();
    const blob = new Blob([fs.readFileSync(tmp)], { type: 'video/mp4' });
    form.append('video', blob, 'express-bootstrap.mp4');

    const uploaded = await req('POST', `/admin/lessons/${videoLessonId}/video`, {
      token: adminToken,
      formData: form,
      expectStatus: 200,
    });
    fs.unlinkSync(tmp);
    ok(
      'POST lesson video upload',
      `status=${uploaded.data.data.lesson.content?.video?.processingStatus}`
    );

    const status = await req('GET', `/admin/lessons/${videoLessonId}/video/status`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET video status', status.data.data.processingStatus);
  }

  // Resources — real PDF
  let resourceId;
  {
    const tmp = path.join(os.tmpdir(), `skillbee-syllabus-${stamp}.pdf`);
    fs.writeFileSync(
      tmp,
      `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>endobj
4 0 obj<< /Length 55 >>stream
BT /F1 24 Tf 100 700 Td (SkillBee Node.js Syllabus) Tj ET
endstream endobj
xref
0 5
trailer<< /Root 1 0 R >>
startxref
0
%%EOF`
    );

    const form = new FormData();
    form.append('title', 'Node.js Backend Mastery — Course Syllabus');
    form.append('resourceType', 'pdf');
    form.append(
      'description',
      'Week-by-week syllabus covering Express, MongoDB, JWT, and curriculum APIs.'
    );
    form.append(
      'file',
      new Blob([fs.readFileSync(tmp)], { type: 'application/pdf' }),
      'skillbee-nodejs-syllabus.pdf'
    );

    const created = await req('POST', `/admin/courses/${courseId}/resources`, {
      token: adminToken,
      formData: form,
      expectStatus: 201,
    });
    fs.unlinkSync(tmp);
    resourceId = created.data.data.resource.id;
    ok('POST course resource (PDF)', created.data.data.resource.title);

    const listed = await req('GET', `/admin/courses/${courseId}/resources`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET course resources', `count=${listed.data.data.resources.length}`);

    const one = await req('GET', `/admin/resources/${resourceId}`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET resource', one.data.data.resource.originalFileName);

    const updated = await req('PATCH', `/admin/resources/${resourceId}`, {
      token: adminToken,
      body: {
        description: 'Updated syllabus with Module 2 Auth & RBAC schedule.',
      },
      expectStatus: 200,
    });
    ok('PATCH resource', updated.data.data.resource.description.slice(0, 40));
  }

  // Publish + public + analytics + preview + students + duplicate
  {
    const published = await req('PATCH', `/admin/courses/${courseId}/status`, {
      token: adminToken,
      body: { status: 'published' },
      expectStatus: 200,
    });
    ok('PATCH status → published', `publishedAt=${published.data.data.course.publishedAt}`);

    const preview = await req('GET', `/admin/courses/${courseId}/preview`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET preview', preview.data.data.course.slug);

    const students = await req('GET', `/admin/courses/${courseId}/students`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET students', `count=${students.data.data.students.length}`);

    const analytics = await req('GET', `/admin/courses/${courseId}/analytics`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok(
      'GET analytics',
      `lessons=${analytics.data.data.analytics.totalLessons}, topics=${analytics.data.data.analytics.totalTopics}`
    );

    const pubList = await req('GET', '/courses?search=Node.js', { expectStatus: 200 });
    ok('GET /courses (public)', `total=${pubList.data.pagination.total}`);

    const pubOne = await req('GET', `/courses/${courseSlug}`, { expectStatus: 200 });
    ok('GET /courses/:slug', pubOne.data.data.course.title);

    const curriculum = await req('GET', `/courses/${courseSlug}/curriculum`, {
      expectStatus: 200,
    });
    const previewLesson = curriculum.data.data.topics
      .flatMap((t) => t.lessons)
      .find((l) => l.isPreview);
    ok(
      'GET public curriculum',
      `previewLocked=${previewLesson?.locked === false ? 'open' : 'n/a'}`
    );

    const dup = await req('POST', `/admin/courses/${courseId}/duplicate`, {
      token: adminToken,
      expectStatus: 201,
    });
    ok('POST duplicate', `${dup.data.data.course.slug} status=${dup.data.data.course.status}`);

    // Soft delete the duplicate only (keep original published course)
    const delDup = await req('DELETE', `/admin/courses/${dup.data.data.course.id}`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('DELETE duplicate course (soft)', `deletedAt=${delDup.data.data.course.deletedAt}`);
  }

  // Category courses + instructor courses
  {
    const catCourses = await req('GET', `/admin/course-categories/${categoryId}/courses`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET category courses', `count=${catCourses.data.data.length}`);

    const instCourses = await req('GET', `/admin/instructors/${instructorId}/courses`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET instructor courses', `count=${instCourses.data.data.length}`);
  }

  // Learning download without enrollment should 403
  {
    // create student
    const studentEmail = `ananya.learner.${stamp}@skillbee.in`;
    const reg = await req('POST', '/auth/register', {
      body: {
        firstName: 'Ananya',
        lastName: 'Gupta',
        email: studentEmail,
        phone: '+91 98111 22334',
        password: 'AnanyaSecure1',
        profile: { education: 'B.Tech IT', college: 'NSUT Delhi' },
      },
      expectStatus: 201,
    });
    const studentToken = reg.data.data.accessToken;

    const denied = await req('GET', `/learning/resources/${resourceId}/download`, {
      token: studentToken,
    });
    if (denied.status === 403) {
      ok('Student download without enrollment', '403 NOT_ENROLLED');
    } else {
      fail('Student download without enrollment', `status=${denied.status}`);
    }
  }

  // Unpublish then re-publish (edit workflow)
  {
    const draft = await req('PATCH', `/admin/courses/${courseId}/status`, {
      token: adminToken,
      body: { status: 'draft' },
      expectStatus: 200,
    });
    ok('PATCH status → draft (unpublish)', draft.data.data.course.status);

    const hidden = await req('GET', `/courses/${courseSlug}`);
    if (hidden.status === 404) ok('Draft hidden from public', '404');
    else fail('Draft hidden from public', `status=${hidden.status}`);

    await req('PATCH', `/admin/courses/${courseId}/status`, {
      token: adminToken,
      body: { status: 'published' },
      expectStatus: 200,
    });
    ok('PATCH status → published again');
  }

  // Delete a disposable topic lesson then a disposable topic (not the main ones)
  {
    const tempTopic = await req('POST', `/admin/courses/${courseId}/topics`, {
      token: adminToken,
      body: { title: 'Temp Scratch Topic', description: 'Will be deleted' },
      expectStatus: 201,
    });
    const delTopic = await req(
      'DELETE',
      `/admin/courses/${courseId}/topics/${tempTopic.data.data.topic.id}`,
      { token: adminToken, expectStatus: 200 }
    );
    ok('DELETE topic', delTopic.data.data.topic.title);

    const tempLesson = await req('POST', `/admin/topics/${topicId}/lessons`, {
      token: adminToken,
      body: {
        title: 'Temp Scratch Lesson',
        type: 'text',
        content: { textContent: 'temporary' },
      },
      expectStatus: 201,
    });
    const delLesson = await req('DELETE', `/admin/lessons/${tempLesson.data.data.lesson.id}`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('DELETE lesson', delLesson.data.data.lesson.status);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n——— Course API Summary: ${passed} passed, ${failed} failed ———\n`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error('\n💥 Fatal:', err.message);
  process.exit(1);
});
