/**
 * Live Phase 4 media verification against running API.
 * Images are uploaded FOR REAL to Cloudinary (not mock confirm).
 * Videos/docs go to VPS. Images/videos remain view-only.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const BASE = process.env.API_BASE || 'http://127.0.0.1:5000/api/v1';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SUPER_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SUPER_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');
  process.exit(1);
}

/** Tiny valid 1x1 PNG */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function api(method, urlPath, { token, body, formData, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) payload = formData;
  else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers: h, body: payload });
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

async function uploadToCloudinarySigned(uploadUrl, uploadParameters, fileBuffer, fileName) {
  const form = new FormData();
  for (const [key, value] of Object.entries(uploadParameters)) {
    form.append(key, String(value));
  }
  form.append('file', new Blob([fileBuffer], { type: 'image/png' }), fileName);
  const res = await fetch(uploadUrl, { method: 'POST', body: form });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Cloudinary upload failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  console.log('E2E media check', BASE);
  const login = await api('POST', '/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assert(login.status === 200, `login ${login.status}`);
  const token = login.json.data.accessToken;

  // --- 1) REAL Cloudinary upload via signed session ---
  console.log('1) Signed Cloudinary flow (real upload)...');
  const img = await api('POST', '/admin/media/upload-url', {
    token,
    body: {
      mediaType: 'image',
      category: 'course_thumbnail',
      originalFileName: 'e2e-real-thumb.png',
      mimeType: 'image/png',
      sizeBytes: TINY_PNG.length,
    },
  });
  assert(img.status === 201, `image session ${img.status} ${JSON.stringify(img.json)}`);
  assert(img.json.data.provider === 'cloudinary', 'expected cloudinary provider');
  assert(img.json.data.downloadAllowed === false, 'image must be view-only');

  const cloudResult = await uploadToCloudinarySigned(
    img.json.data.uploadUrl,
    img.json.data.uploadParameters,
    TINY_PNG,
    'e2e-real-thumb.png'
  );
  console.log('   Cloudinary public_id:', cloudResult.public_id);
  console.log('   Cloudinary secure_url:', cloudResult.secure_url);

  const confirmImg = await api('POST', '/admin/media/confirm', {
    token,
    body: {
      uploadId: img.json.data.uploadId,
      provider: 'cloudinary',
      cloudinary: {
        publicId: cloudResult.public_id,
        secureUrl: cloudResult.secure_url,
        bytes: cloudResult.bytes,
        width: cloudResult.width,
        height: cloudResult.height,
        format: cloudResult.format,
      },
    },
  });
  assert(confirmImg.status === 201, `confirm image ${JSON.stringify(confirmImg.json)}`);
  assert(
    confirmImg.json.data.media.secureUrl?.includes('res.cloudinary.com'),
    'confirmed media must have real Cloudinary URL'
  );
  console.log('   MediaAsset id:', confirmImg.json.data.media.id);

  // --- 2) Direct multipart → Cloudinary (server-side) ---
  console.log('2) Direct /admin/media/images multipart → Cloudinary...');
  const directForm = new FormData();
  directForm.append('category', 'course_gallery');
  directForm.append('title', 'E2E Direct Cloudinary Image');
  directForm.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'e2e-direct.png');
  const direct = await api('POST', '/admin/media/images', {
    token,
    formData: directForm,
  });
  assert(direct.status === 201, `direct upload ${JSON.stringify(direct.json)}`);
  assert(direct.json.data.media.storageProvider === 'cloudinary', 'must be cloudinary');
  assert(direct.json.data.media.secureUrl?.includes(process.env.CLOUDINARY_CLOUD_NAME || ''), 'cloud name in URL');
  console.log('   Direct publicId:', direct.json.data.media.publicId);
  console.log('   Direct URL:', direct.json.data.media.secureUrl);

  // --- 3) VPS video ---
  console.log('3) VPS video upload...');
  const vidSession = await api('POST', '/admin/media/upload-url', {
    token,
    body: {
      mediaType: 'video',
      category: 'lesson_video',
      originalFileName: 'e2e.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 64,
    },
  });
  assert(vidSession.status === 201, `video session ${vidSession.status}`);
  const videoPath = path.join(os.tmpdir(), `e2e-media-${Date.now()}.mp4`);
  const buf = Buffer.alloc(32, 0);
  buf.write('xxxxftyp', 0, 'ascii');
  fs.writeFileSync(videoPath, buf);
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(videoPath)], { type: 'video/mp4' }), 'e2e.mp4');
  const up = await api('PUT', `/admin/media/uploads/${vidSession.json.data.uploadId}/content`, {
    token,
    formData: form,
    headers: { 'X-Upload-Token': vidSession.json.data.uploadToken },
  });
  fs.unlinkSync(videoPath);
  assert(up.status === 200, `video upload ${JSON.stringify(up.json)}`);
  const confirmVid = await api('POST', '/admin/media/confirm', {
    token,
    body: { uploadId: vidSession.json.data.uploadId, provider: 'local' },
  });
  assert(confirmVid.status === 201, `confirm video ${JSON.stringify(confirmVid.json)}`);

  // --- 4) VPS PDF ---
  console.log('4) VPS PDF upload...');
  const pdfSession = await api('POST', '/admin/media/upload-url', {
    token,
    body: {
      mediaType: 'document',
      category: 'study_material',
      originalFileName: 'e2e.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 64,
    },
  });
  const pdfPath = path.join(os.tmpdir(), `e2e-${Date.now()}.pdf`);
  fs.writeFileSync(pdfPath, '%PDF-1.4 e2e');
  const pform = new FormData();
  pform.append('file', new Blob([fs.readFileSync(pdfPath)], { type: 'application/pdf' }), 'e2e.pdf');
  const pup = await api('PUT', `/admin/media/uploads/${pdfSession.json.data.uploadId}/content`, {
    token,
    formData: pform,
    headers: { 'X-Upload-Token': pdfSession.json.data.uploadToken },
  });
  fs.unlinkSync(pdfPath);
  assert(pup.status === 200, `pdf upload ${JSON.stringify(pup.json)}`);
  const confirmPdf = await api('POST', '/admin/media/confirm', {
    token,
    body: { uploadId: pdfSession.json.data.uploadId, provider: 'local' },
  });
  assert(confirmPdf.status === 201, `confirm pdf ${JSON.stringify(confirmPdf.json)}`);

  const storage = await api('GET', '/admin/media/storage', { token });
  assert(storage.status === 200, 'storage stats');
  console.log('storage totals', storage.json.data.totals);
  console.log('E2E media verification PASSED — check Cloudinary Media Library for skillbee/* images');
}

main().catch((err) => {
  console.error('E2E FAILED', err);
  process.exit(1);
});
