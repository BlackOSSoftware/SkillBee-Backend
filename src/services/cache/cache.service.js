import { env } from '../../config/env.js';
import {
  getRedisClient,
  recordCacheDelete,
  recordCacheError,
  recordCacheHit,
  recordCacheInvalidation,
  recordCacheMiss,
  recordCacheSet,
  redisHealthCheck,
} from '../../config/redis.js';

/** In-process promise map — stampede protection within one Node process */
const inflight = new Map();

function fullKey(key) {
  return `${env.REDIS_KEY_PREFIX || 'skillbee:'}${key}`;
}

function serialize(value) {
  return JSON.stringify({ v: value, cachedAt: Date.now() });
}

function deserialize(raw) {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'v')) {
      return parsed.v;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function getCache(key) {
  const redis = getRedisClient();
  if (!redis) {
    recordCacheMiss();
    return null;
  }
  try {
    const raw = await redis.get(fullKey(key));
    if (raw == null) {
      recordCacheMiss();
      return null;
    }
    const value = deserialize(raw);
    if (value === undefined) {
      recordCacheMiss();
      return null;
    }
    recordCacheHit();
    return value;
  } catch {
    recordCacheError();
    return null;
  }
}

export async function setCache(key, value, ttlSeconds = 300) {
  if (value === undefined || value === null) return false;
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    const ttl = Math.max(1, Number(ttlSeconds) || 300);
    await redis.set(fullKey(key), serialize(value), 'EX', ttl);
    recordCacheSet();
    return true;
  } catch {
    recordCacheError();
    return false;
  }
}

export async function deleteCache(key) {
  const redis = getRedisClient();
  if (!redis) return 0;
  try {
    const n = await redis.del(fullKey(key));
    recordCacheDelete(n);
    recordCacheInvalidation(n);
    return n;
  } catch {
    recordCacheError();
    return 0;
  }
}

/** SCAN-based delete — never FLUSHALL/FLUSHDB */
export async function deleteByPattern(logicalPattern) {
  const redis = getRedisClient();
  if (!redis) return 0;
  let deleted = 0;
  const match = fullKey(logicalPattern);
  try {
    let cursor = '0';
    do {
      // eslint-disable-next-line no-await-in-loop
      const [next, keys] = await redis.scan(cursor, 'MATCH', match, 'COUNT', 100);
      cursor = next;
      if (keys?.length) {
        // eslint-disable-next-line no-await-in-loop
        const n = await redis.del(...keys);
        deleted += n;
      }
    } while (cursor !== '0');
    recordCacheDelete(deleted);
    recordCacheInvalidation(deleted);
    return deleted;
  } catch {
    recordCacheError();
    return deleted;
  }
}

export async function clearCacheByPrefix(prefix) {
  return deleteByPattern(`${prefix}*`);
}

/**
 * Cache-aside with in-flight deduplication (stampede protection).
 */
export async function getOrSetCache(key, ttlSeconds, producer) {
  const cached = await getCache(key);
  if (cached !== null && cached !== undefined) {
    return cached;
  }

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = (async () => {
    try {
      const value = await producer();
      if (value !== undefined && value !== null) {
        await setCache(key, value, ttlSeconds);
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

export async function cacheHealthCheck() {
  return redisHealthCheck();
}

export { inflight as _inflightForTests, fullKey as _fullKeyForTests };
