/**
 * Live API verification for Phase 3 against the running backend + configured MongoDB.
 * Usage: node scripts/e2e-curriculum-check.mjs
 * Requires: server running, admin credentials via env or defaults from seed.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const BASE = process.env.API_BASE || 'http://127.0.0.1:5000/api/v1';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SUPER_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SUPER_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (or SEED_SUPER_ADMIN_*)');
  process.exit(1);
}

async function api(method, urlPath, { token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body: payload });
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
  console.log('E2E curriculum check against', BASE);

  const login = await api('POST', '/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assert(login.status === 200, `Login failed: ${login.status}`);
  const token = login.json.data.accessToken;

  const categories = await api('GET', '/admin/course-categories', { token });
  assert(categories.status === 200, 'List categories failed');
  let categoryId = categories.json.data?.categories?.[0]?.id;
  if (!categoryId) {
    const createdCat = await api('POST', '/admin/course-categories', {
      token,
      body: { name: `E2E Cat ${Date.now()}`, description: 'e2e' },
    });
    assert(createdCat.status === 201, 'Create category failed');
    categoryId = createdCat.json.data.category.id;
  }

  const course = await api('POST', '/admin/courses', {
    token,
    body: {
      title: `E2E CSV Curriculum ${Date.now()}`,
      description: '<p>Phase 3 live verification course</p>',
      thumbnail: {
        publicId: 'skillbee/e2e/thumb',
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/skillbee/e2e/thumb.jpg',
      },
      categoryIds: [categoryId],
      pricing: { type: 'free', regularPrice: 0, currency: 'INR' },
    },
  });
  assert(course.status === 201, `Create course failed: ${JSON.stringify(course.json)}`);
  const courseId = course.json.data.course.id;
  console.log('course', courseId);

  const topicTitles = [
    'Introduction to Computerized System Validation',
    'GAMP 5 and Risk-Based Validation',
    'Validation Documentation',
    'Testing and Qualification',
    'Data Integrity and Compliance',
  ];
  const topicIds = [];
  for (const title of topicTitles) {
    const t = await api('POST', `/admin/courses/${courseId}/topics`, {
      token,
      body: { title, status: 'draft', availabilityType: 'immediate' },
    });
    assert(t.status === 201, `Create topic failed: ${title}`);
    topicIds.push(t.json.data.topic.id);
  }
  console.log('topics', topicIds.length);

  const lessonIds = [];
  for (const topicId of topicIds) {
    const text = await api('POST', `/admin/topics/${topicId}/lessons`, {
      token,
      body: {
        title: `Lesson for topic ${topicId.slice(-4)}`,
        type: 'text',
        textContent: { body: '<p>Demo lesson body</p>', format: 'html' },
      },
    });
    assert(text.status === 201, 'Create text lesson failed');
    lessonIds.push(text.json.data.lesson.id);
  }

  const videoLesson = await api('POST', `/admin/topics/${topicIds[0]}/lessons`, {
    token,
    body: {
      title: 'Understanding GAMP 5 Principles',
      type: 'video',
      durationSeconds: 600,
    },
  });
  assert(videoLesson.status === 201, 'Create video lesson failed');
  const videoLessonId = videoLesson.json.data.lesson.id;

  const updated = await api('PATCH', `/admin/lessons/${lessonIds[0]}`, {
    token,
    body: { title: 'Introduction to CSV (Updated)' },
  });
  assert(updated.status === 200, 'Update lesson failed');

  const reorderTopics = await api('PATCH', `/admin/courses/${courseId}/topics/reorder`, {
    token,
    body: { topicIds: [...topicIds].reverse() },
  });
  assert(reorderTopics.status === 200, `Reorder topics failed: ${JSON.stringify(reorderTopics.json)}`);

  const lessonsInFirst = await api('GET', `/admin/topics/${topicIds[0]}/lessons`, { token });
  assert(lessonsInFirst.status === 200, 'List lessons failed');
  const reorderLessons = await api('PATCH', `/admin/topics/${topicIds[0]}/lessons/reorder`, {
    token,
    body: { lessonIds: lessonsInFirst.json.data.lessons.map((l) => l.id) },
  });
  assert(reorderLessons.status === 200, 'Reorder lessons failed');

  const moved = await api('POST', `/admin/lessons/${lessonIds[1]}/move`, {
    token,
    body: { targetTopicId: topicIds[2], targetPosition: 0 },
  });
  assert(moved.status === 200, 'Move lesson failed');

  const pdfPath = path.join(os.tmpdir(), `e2e-att-${Date.now()}.pdf`);
  fs.writeFileSync(pdfPath, '%PDF-1.4 e2e');
  const form = new FormData();
  form.append('title', 'E2E Syllabus');
  form.append('visibility', 'enrolled');
  form.append('file', new Blob([fs.readFileSync(pdfPath)], { type: 'application/pdf' }), path.basename(pdfPath));
  const att = await api('POST', `/admin/lessons/${lessonIds[0]}/attachments`, {
    token,
    formData: form,
  });
  fs.unlinkSync(pdfPath);
  assert(att.status === 201, `Attachment upload failed: ${JSON.stringify(att.json)}`);

  const videoPath = path.join(os.tmpdir(), `e2e-vid-${Date.now()}.mp4`);
  fs.writeFileSync(videoPath, Buffer.from('e2e-fake-mp4'));
  const vform = new FormData();
  vform.append(
    'video',
    new Blob([fs.readFileSync(videoPath)], { type: 'video/mp4' }),
    path.basename(videoPath)
  );
  const vup = await api('POST', `/admin/lessons/${videoLessonId}/video/upload`, {
    token,
    formData: vform,
  });
  fs.unlinkSync(videoPath);
  assert(vup.status === 200, `Video upload failed: ${JSON.stringify(vup.json)}`);
  console.log('video status', vup.json.data.lesson.content.video.processingStatus);

  const vstatus = await api('GET', `/admin/lessons/${videoLessonId}/video/status`, { token });
  assert(vstatus.status === 200, 'Video status failed');

  for (const id of topicIds) {
    await api('PATCH', `/admin/topics/${id}/status`, { token, body: { status: 'published' } });
  }
  await api('PATCH', `/admin/lessons/${lessonIds[0]}/status`, {
    token,
    body: { status: 'published' },
  });
  await api('PATCH', `/admin/lessons/${videoLessonId}/status`, {
    token,
    body: { status: 'published' },
  });

  const archived = await api('DELETE', `/admin/lessons/${lessonIds[2]}`, { token });
  assert(archived.status === 200, 'Archive lesson failed');
  assert(archived.json.data.lesson.deletedAt, 'deletedAt missing');

  const curriculum = await api('GET', `/admin/courses/${courseId}/topics?includeLessons=true`, {
    token,
  });
  assert(curriculum.status === 200, 'Final curriculum list failed');
  console.log(
    'OK topics=',
    curriculum.json.data.topics.length,
    'first lessons=',
    curriculum.json.data.topics[0]?.lessons?.length
  );
  console.log('E2E curriculum verification PASSED');
}

main().catch((err) => {
  console.error('E2E FAILED', err);
  process.exit(1);
});
