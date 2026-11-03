# Redis caching

## Architecture

**Cache-aside** with MongoDB Atlas as source of truth.

1. Check Redis  
2. On miss → query MongoDB  
3. Store JSON with TTL  
4. Return result  

If Redis is disabled or down, every request falls through to MongoDB (no API failure).

## Client

- `ioredis` singleton: `src/config/redis.js`
- Manual key prefix: `REDIS_KEY_PREFIX` (default `skillbee:`)
- Lazy connect, retry with backoff, graceful `quit` on shutdown

## Cache service

`src/services/cache/cache.service.js`

| Method | Purpose |
|--------|---------|
| `getCache` | Read |
| `setCache` | Write + TTL |
| `deleteCache` | Single key |
| `deleteByPattern` / `clearCacheByPrefix` | SCAN-based (never FLUSH*) |
| `getOrSetCache` | Cache-aside + in-process stampede dedupe |
| `cacheHealthCheck` | Ping + memory snippet |

## TTLs (`src/services/cache/keys.js`)

| Data | TTL |
|------|-----|
| Course listing | 300s |
| Course detail | 300s |
| Featured | 300s |
| Categories | 1800s |
| Curriculum | 300s |
| Assignment listing | 120s |
| Dashboard analytics | 60s |

## Cached APIs

- Public course list / featured / detail (public payload)
- Public categories
- Public curriculum (`enrolled=0|1` key split)
- Course analytics (admin/instructor, short TTL)
- Student assignment listings (keyed by `studentId` + course + filters)

## Never cached

- Auth/login tokens, password reset
- Quiz answer keys / in-progress attempts / grading payloads in shared keys
- File binaries / upload tokens
- Authorization decisions as sole gate (authz still runs before private cache use)

## Metrics

`GET /api/v1/admin/system/cache-metrics` (admin) — hits, misses, hit ratio, invalidations, Redis health.
