/**
 * Live API smoke test against running server (real MongoDB).
 * Usage: node scripts/e2e-api-check.mjs
 */
import 'dotenv/config';

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

async function req(method, path, { token, body, expectStatus } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (expectStatus != null && res.status !== expectStatus) {
    const err = new Error(
      `${method} ${path} expected ${expectStatus}, got ${res.status}: ${JSON.stringify(data)}`
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return { status: res.status, data };
}

async function main() {
  console.log(`\n🔍 Skillbee live API check → ${BASE}\n`);

  // Health
  {
    const health = await fetch(`http://localhost:${process.env.PORT || 5000}/health`);
    const data = await health.json();
    if (health.status === 200 && data?.data?.status === 'ok') {
      ok('GET /health');
    } else {
      fail('GET /health', JSON.stringify(data));
      process.exit(1);
    }
  }

  // Super admin login
  let adminToken;
  let adminRefresh;
  {
    const { data } = await req('POST', '/auth/login', {
      body: {
        email: process.env.SEED_SUPER_ADMIN_EMAIL || 'admin@skillbee.local',
        password: process.env.SEED_SUPER_ADMIN_PASSWORD || 'ChangeMe123',
      },
      expectStatus: 200,
    });
    adminToken = data.data.accessToken;
    adminRefresh = data.data.refreshToken;
    ok(
      'POST /auth/login (super_admin)',
      `${data.data.user.email} / ${data.data.user.role?.slug}`
    );
  }

  // Me
  {
    const { data } = await req('GET', '/auth/me', {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET /auth/me', `${data.data.user.firstName} ${data.data.user.lastName}`);
  }

  // Permissions + roles list
  let studentRoleId;
  let adminRoleId;
  {
    const { data } = await req('GET', '/admin/permissions', {
      token: adminToken,
      expectStatus: 200,
    });
    ok('GET /admin/permissions', `${data.data.permissions.length} permissions`);
  }
  {
    const { data } = await req('GET', '/admin/roles', {
      token: adminToken,
      expectStatus: 200,
    });
    studentRoleId = data.data.roles.find((r) => r.slug === 'student')?.id;
    adminRoleId = data.data.roles.find((r) => r.slug === 'admin')?.id;
    ok(
      'GET /admin/roles',
      data.data.roles.map((r) => r.slug).join(', ')
    );
  }

  // Create custom role
  let mentorRoleId;
  {
    const { data } = await req('POST', '/admin/roles', {
      token: adminToken,
      body: {
        name: 'Career Mentor',
        slug: `career_mentor_${stamp}`,
        description: 'Guides students on career paths and interview prep',
        permissions: ['users:read'],
      },
      expectStatus: 201,
    });
    mentorRoleId = data.data.role.id;
    ok('POST /admin/roles', data.data.role.slug);
  }

  // Assign permissions
  {
    const { data } = await req('PATCH', `/admin/roles/${mentorRoleId}/permissions`, {
      token: adminToken,
      body: {
        permissions: ['users:read', 'users:write'],
      },
      expectStatus: 200,
    });
    ok(
      'PATCH /admin/roles/:id/permissions',
      data.data.role.permissions.join(', ')
    );
  }

  // Update role
  {
    const { data } = await req('PATCH', `/admin/roles/${mentorRoleId}`, {
      token: adminToken,
      body: {
        description: 'Updated: mentors Skillbee students for placements',
      },
      expectStatus: 200,
    });
    ok('PATCH /admin/roles/:id', data.data.role.description.slice(0, 48));
  }

  // Student self-registration
  const studentEmail = `priya.sharma.${stamp}@skillbee.in`;
  let studentToken;
  let studentRefresh;
  let studentId;
  {
    const { data } = await req('POST', '/auth/register', {
      body: {
        firstName: 'Priya',
        lastName: 'Sharma',
        email: studentEmail,
        phone: '+91 98100 11223',
        password: 'PriyaSecure1',
        profile: {
          education: 'B.Tech Computer Science',
          college: 'Delhi Technological University',
          graduationYear: 2025,
          interests: ['Full-stack', 'UI/UX'],
        },
      },
      expectStatus: 201,
    });
    studentToken = data.data.accessToken;
    studentRefresh = data.data.refreshToken;
    studentId = data.data.user.id;
    ok(
      'POST /auth/register (student)',
      `${data.data.user.email} phone=${data.data.user.phone}`
    );
  }

  // Student login
  {
    const { data } = await req('POST', '/auth/login', {
      body: { email: studentEmail, password: 'PriyaSecure1' },
      expectStatus: 200,
    });
    studentToken = data.data.accessToken;
    studentRefresh = data.data.refreshToken;
    ok('POST /auth/login (student)', `lastLogin=${data.data.user.lastLogin}`);
  }

  // Student blocked from admin
  {
    const res = await req('GET', '/admin/users', { token: studentToken });
    if (res.status === 403) {
      ok('Student blocked from /admin/users', '403 FORBIDDEN');
    } else {
      fail('Student blocked from /admin/users', `status=${res.status}`);
    }
  }

  // Admin create user (instructor-like via mentor role)
  let createdUserId;
  const mentorEmail = `arjun.mehta.${stamp}@skillbee.in`;
  {
    const { data } = await req('POST', '/admin/users', {
      token: adminToken,
      body: {
        firstName: 'Arjun',
        lastName: 'Mehta',
        email: mentorEmail,
        phone: '9876543210',
        password: 'ArjunSecure1',
        roleId: mentorRoleId,
        profileImage: 'https://cdn.skillbee.in/avatars/arjun-mehta.png',
        profile: {
          title: 'Senior Career Mentor',
          expertise: ['DSA', 'System Design', 'Behavioral Interviews'],
          yearsExperience: 8,
        },
        emailVerified: true,
      },
      expectStatus: 201,
    });
    createdUserId = data.data.user.id;
    ok(
      'POST /admin/users',
      `${data.data.user.firstName} ${data.data.user.lastName} / ${data.data.user.role?.slug}`
    );
  }

  // List users with filters
  {
    const { data } = await req(
      'GET',
      `/admin/users?search=Priya&status=active&limit=10`,
      { token: adminToken, expectStatus: 200 }
    );
    ok(
      'GET /admin/users (filters)',
      `total=${data.data.pagination.total}, found=${data.data.users.length}`
    );
  }

  // Get user by id
  {
    const { data } = await req('GET', `/admin/users/${createdUserId}`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok(
      'GET /admin/users/:id',
      `${data.data.user.email} status=${data.data.user.status}`
    );
  }

  // Update user
  {
    const { data } = await req('PATCH', `/admin/users/${createdUserId}`, {
      token: adminToken,
      body: {
        lastName: 'Mehta-Kapoor',
        phone: '+91 99887 76655',
        profile: {
          title: 'Lead Career Mentor',
          expertise: ['DSA', 'System Design', 'Behavioral Interviews', 'Resume Review'],
          yearsExperience: 9,
        },
      },
      expectStatus: 200,
    });
    ok(
      'PATCH /admin/users/:id',
      `${data.data.user.lastName} phone=${data.data.user.phone}`
    );
  }

  // Status suspend then reactivate
  {
    const { data } = await req('PATCH', `/admin/users/${createdUserId}/status`, {
      token: adminToken,
      body: { status: 'suspended' },
      expectStatus: 200,
    });
    ok('PATCH /admin/users/:id/status → suspended', data.data.user.status);
  }
  {
    const { data } = await req('PATCH', `/admin/users/${createdUserId}/status`, {
      token: adminToken,
      body: { status: 'active' },
      expectStatus: 200,
    });
    ok('PATCH /admin/users/:id/status → active', data.data.user.status);
  }

  // Soft delete another temp user (not mentor — keep mentor for login check)
  let tempDeleteId;
  {
    const { data } = await req('POST', '/admin/users', {
      token: adminToken,
      body: {
        firstName: 'Neha',
        lastName: 'Verma',
        email: `neha.verma.${stamp}@skillbee.in`,
        password: 'NehaSecure1',
        roleId: studentRoleId,
        profile: { education: 'MBA Marketing' },
      },
      expectStatus: 201,
    });
    tempDeleteId = data.data.user.id;
  }
  {
    const { data } = await req('DELETE', `/admin/users/${tempDeleteId}`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('DELETE /admin/users/:id (soft)', `deletedAt=${data.data.user.deletedAt}`);
  }

  // Refresh tokens (admin)
  {
    const { data } = await req('POST', '/auth/refresh', {
      body: { refreshToken: adminRefresh },
      expectStatus: 200,
    });
    adminToken = data.data.accessToken;
    adminRefresh = data.data.refreshToken;
    ok('POST /auth/refresh', 'rotated tokens');
  }

  // Forgot + reset password for student
  let resetToken;
  {
    const { data } = await req('POST', '/auth/forgot-password', {
      body: { email: studentEmail },
      expectStatus: 200,
    });
    resetToken = data.data.resetToken;
    if (!resetToken) {
      fail('POST /auth/forgot-password', 'resetToken missing in non-production');
    } else {
      ok('POST /auth/forgot-password', 'resetToken issued');
    }
  }
  if (resetToken) {
    await req('POST', '/auth/reset-password', {
      body: { token: resetToken, password: 'PriyaNewPass1' },
      expectStatus: 200,
    });
    ok('POST /auth/reset-password', 'password updated');

    const login = await req('POST', '/auth/login', {
      body: { email: studentEmail, password: 'PriyaNewPass1' },
      expectStatus: 200,
    });
    studentToken = login.data.data.accessToken;
    studentRefresh = login.data.data.refreshToken;
    ok('POST /auth/login (after reset)', studentEmail);
  }

  // Logout student
  {
    await req('POST', '/auth/logout', {
      token: studentToken,
      body: { refreshToken: studentRefresh },
      expectStatus: 200,
    });
    ok('POST /auth/logout (student)');
  }

  // Refresh after logout should fail
  {
    const res = await req('POST', '/auth/refresh', {
      body: { refreshToken: studentRefresh },
    });
    if (res.status === 401) {
      ok('Refresh after logout rejected', '401');
    } else {
      fail('Refresh after logout rejected', `status=${res.status}`);
    }
  }

  // Logout admin
  {
    await req('POST', '/auth/logout', {
      token: adminToken,
      body: { refreshToken: adminRefresh },
      expectStatus: 200,
    });
    ok('POST /auth/logout (super_admin)');
  }

  // Cleanup: delete unused custom role (must not be assigned — mentor role is assigned)
  // Create disposable role then delete
  {
    // re-login admin for cleanup
    const login = await req('POST', '/auth/login', {
      body: {
        email: process.env.SEED_SUPER_ADMIN_EMAIL || 'admin@skillbee.local',
        password: process.env.SEED_SUPER_ADMIN_PASSWORD || 'ChangeMe123',
      },
      expectStatus: 200,
    });
    adminToken = login.data.data.accessToken;

    const created = await req('POST', '/admin/roles', {
      token: adminToken,
      body: {
        name: 'Temp Reviewer',
        slug: `temp_reviewer_${stamp}`,
        permissions: [],
      },
      expectStatus: 201,
    });

    await req('DELETE', `/admin/roles/${created.data.data.role.id}`, {
      token: adminToken,
      expectStatus: 200,
    });
    ok('DELETE /admin/roles/:id (unused)', created.data.data.role.slug);

    // Role in use should fail
    const inUse = await req('DELETE', `/admin/roles/${mentorRoleId}`, {
      token: adminToken,
    });
    if (inUse.status === 400 && inUse.data?.error?.code === 'ROLE_IN_USE') {
      ok('DELETE role in use blocked', 'ROLE_IN_USE');
    } else {
      fail('DELETE role in use blocked', JSON.stringify(inUse.data));
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n——— Summary: ${passed} passed, ${failed} failed ———\n`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error('\n💥 Fatal:', err.message);
  process.exit(1);
});
