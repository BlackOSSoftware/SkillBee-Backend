// Promote a freshly registered user to super_admin in the dev DB, then run
// the same PUT /auth/me checks as the student flow (role-agnostic endpoint).
import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Role } from '../src/models/Role.js';

const BASE = 'http://localhost:5000/api/v1';
const email = `admin-profile-test-${Date.now()}@example.com`;
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const pngBuffer = Buffer.from(PNG_B64, 'base64');

await mongoose.connect(process.env.MONGODB_URI);

// Register via API
const reg = await fetch(`${BASE}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ firstName: 'Admin', lastName: 'Profile', email, password: 'Secret123' }),
}).then((r) => r.json());
const token = reg.data.accessToken;
console.log('registered:', reg.data.user.email);

// Promote to super_admin
const role = await Role.findOne({ slug: 'super_admin' });
const user = await User.findOne({ email });
user.roleId = role._id;
await user.save();
console.log('promoted to:', role.slug);

// Re-login so the token carries the new role
const login = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'Secret123' }),
}).then((r) => r.json());
const adminToken = login.data.accessToken;
console.log('role in token session:', login.data.user.role?.slug);

async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { Authorization: `Bearer ${adminToken}` };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const me = await api('/auth/me');
console.log('\nGET /auth/me:', me.status, me.body.data.user.firstName, me.body.data.user.lastName, '| role:', me.body.data.user.role?.slug);

const put1 = await api('/auth/me', { method: 'PUT', body: { firstName: 'Super', lastName: 'Admin' } });
console.log('PUT names:', put1.status, put1.body.data.user.firstName, put1.body.data.user.lastName);

const form = new FormData();
form.append('profileImage', new Blob([pngBuffer], { type: 'image/png' }), 'admin.png');
const put2 = await api('/auth/me', { method: 'PUT', form });
console.log('PUT photo:', put2.status, put2.body.data.user.profileImage);

const put3 = await api('/auth/me', { method: 'PUT', body: { removeProfileImage: true } });
console.log('PUT remove photo:', put3.status, 'photo =', put3.body.data.user.profileImage);

const rej = await api('/auth/me', { method: 'PUT', body: { email: 'x@x.com' } });
console.log('PUT email rejected:', rej.status, rej.body.error.code);

await mongoose.disconnect();
