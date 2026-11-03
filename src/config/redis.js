import Redis from 'ioredis';
import { env } from './env.js';

let client = null;
let connectAttempted = false;
let lastError = null;

const metrics = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
  errors: 0,
  invalidations: 0,
};

export function getCacheMetrics() {
  const total = metrics.hits + metrics.misses;
  return {
    ...metrics,
    hitRatio: total > 0 ? Number((metrics.hits / total).toFixed(4)) : null,
    enabled: env.REDIS_ENABLED,
    connected: Boolean(client && client.status === 'ready'),
    status: client?.status || 'disabled',
    lastError: lastError ? String(lastError.message || lastError) : null,
  };
}

export function recordCacheHit() {
  metrics.hits += 1;
}
export function recordCacheMiss() {
  metrics.misses += 1;
}
export function recordCacheSet() {
  metrics.sets += 1;
}
export function recordCacheDelete(count = 1) {
  metrics.deletes += count;
}
export function recordCacheError() {
  metrics.errors += 1;
}
export function recordCacheInvalidation(count = 1) {
  metrics.invalidations += count;
}

/**
 * Lazy singleton. Returns null when Redis is disabled or unavailable.
 * Callers must tolerate null and fall back to MongoDB.
 */
export function getRedisClient() {
  if (!env.REDIS_ENABLED) return null;
  if (client) return client;
  if (connectAttempted && !client) return null;

  connectAttempted = true;
  try {
    // Prefix is applied in cache.service (avoids SCAN/DEL double-prefix bugs)
    client = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      db: env.REDIS_DB,
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 20) return null;
        return Math.min(times * 200, 3000);
      },
    });

    client.on('error', (err) => {
      lastError = err;
      // Avoid flooding logs — one-line warning
      if (env.NODE_ENV !== 'test') {
        console.warn('[redis] error:', err.message);
      }
    });
    client.on('connect', () => {
      lastError = null;
      if (env.NODE_ENV !== 'test') console.log('[redis] connected');
    });
    client.on('reconnecting', () => {
      if (env.NODE_ENV !== 'test') console.log('[redis] reconnecting…');
    });

    // Fire-and-forget connect; get/set will await readiness via commands
    client.connect().catch((err) => {
      lastError = err;
      if (env.NODE_ENV !== 'test') {
        console.warn('[redis] initial connect failed — running without cache:', err.message);
      }
    });

    return client;
  } catch (err) {
    lastError = err;
    client = null;
    return null;
  }
}

export async function initRedis() {
  if (!env.REDIS_ENABLED) return { enabled: false, connected: false };
  const redis = getRedisClient();
  if (!redis) return { enabled: true, connected: false };
  try {
    if (redis.status !== 'ready') {
      await redis.connect().catch(() => {});
    }
    const pong = await redis.ping();
    return { enabled: true, connected: pong === 'PONG', status: redis.status };
  } catch (err) {
    lastError = err;
    return { enabled: true, connected: false, error: err.message };
  }
}

export async function disconnectRedis() {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
  }
  client = null;
  connectAttempted = false;
}

export async function redisHealthCheck() {
  if (!env.REDIS_ENABLED) {
    return { enabled: false, ok: true, status: 'disabled' };
  }
  const redis = getRedisClient();
  if (!redis) {
    return { enabled: true, ok: false, status: 'unavailable', lastError: lastError?.message };
  }
  try {
    const start = Date.now();
    const pong = await redis.ping();
    let memory = null;
    try {
      const info = await redis.info('memory');
      const used = /used_memory_human:(\S+)/.exec(info);
      memory = used ? used[1] : null;
    } catch {
      /* ignore */
    }
    return {
      enabled: true,
      ok: pong === 'PONG',
      status: redis.status,
      latencyMs: Date.now() - start,
      memory,
    };
  } catch (err) {
    recordCacheError();
    return { enabled: true, ok: false, status: redis.status, error: err.message };
  }
}
