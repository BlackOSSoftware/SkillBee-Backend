import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import {
  createTestApp,
  promoteToRole,
  startTestDatabase,
  stopTestDatabase,
  clearCollections,
} from './helpers/setup.js';
import { ROLE_SLUGS } from '../src/config/security.js';
import {
  _inflightForTests,
  getCache,
  getOrSetCache,
  setCache,
  deleteCache,
  clearCacheByPrefix,
} from '../src/services/cache/cache.service.js';
import { invalidateCourseCaches } from '../src/services/cache/invalidation.service.js';
import { getCacheMetrics } from '../src/config/redis.js';

const API = '/api/v1';

describe('Redis cache layer', () => {
  let app;
  let adminToken;

  before(async () => {
    // Ensure tests never require a live Redis
    process.env.REDIS_ENABLED = 'false';
    await startTestDatabase();
    app = await createTestApp();
  });

  after(async () => {
    await stopTestDatabase();
  });

  it('getOrSetCache falls back to producer when Redis is disabled', async () => {
    const value = await getOrSetCache('test:fallback', 60, async () => ({ ok: true }));
    assert.deepEqual(value, { ok: true });
    const cached = await getCache('test:fallback');
    assert.equal(cached, null);
  });

  it('deduplicates concurrent misses (stampede protection)', async () => {
    _inflightForTests.clear();
    let calls = 0;
    const producer = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 40));
      return { n: calls };
    };
    const [a, b] = await Promise.all([
      getOrSetCache('test:stampede', 60, producer),
      getOrSetCache('test:stampede', 60, producer),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(a, b);
  });

  it('set/delete are no-ops when Redis disabled (no throw)', async () => {
    assert.equal(await setCache('x', { a: 1 }, 10), false);
    assert.equal(await deleteCache('x'), 0);
    assert.equal(await clearCacheByPrefix('x'), 0);
    await invalidateCourseCaches({ slug: 'demo' });
  });

  it('health includes redis status', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.redis.enabled, false);
    assert.ok(res.body.data.redis.status === 'disabled' || res.body.data.redis.ok === true);
  });

  it('admin cache-metrics requires auth', async () => {
    await clearCollections();
    const reg = await request(app).post(`${API}/auth/register`).send({
      firstName: 'A',
      lastName: 'B',
      email: 'cache.admin@skillbee.test',
      password: 'Secret123',
    });
    assert.equal(reg.status, 201);
    await promoteToRole('cache.admin@skillbee.test', ROLE_SLUGS.ADMIN);
    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'cache.admin@skillbee.test', password: 'Secret123' });
    adminToken = login.body.data.accessToken;

    const denied = await request(app).get(`${API}/admin/system/cache-metrics`);
    assert.equal(denied.status, 401);

    const ok = await request(app)
      .get(`${API}/admin/system/cache-metrics`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(ok.status, 200);
    assert.ok(ok.body.data.metrics);
    const m = getCacheMetrics();
    assert.equal(typeof m.hits, 'number');
  });
});
