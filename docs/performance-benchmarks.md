# Performance benchmarks

## Method

1. Start API with `REDIS_ENABLED=false` → measure `GET /api/v1/courses` (N runs).
2. Start Redis (`docker compose -f docker-compose.dev.yml up -d`), set `REDIS_ENABLED=true`, restart API.
3. Flush cache keys (optional): `docker exec redis redis-cli FLUSHDB`
4. Run `npm run bench:cache` (first request = Mongo miss; later = Redis hits).
5. Confirm `/health` shows `redis.ok: true` and admin cache-metrics show rising hits.

```bash
npm run bench:cache
# or
$env:API_BASE='http://127.0.0.1:5000/api/v1'; $env:BENCH_PATH='/courses'; $env:BENCH_RUNS='8'; npm run bench:cache
```

## Results (this environment — 2026-11-02)

Environment: Windows host, existing Docker Redis on `127.0.0.1:6379` (no password), `REDIS_ENABLED=true`, MongoDB Atlas.

| Scenario | Result |
|----------|--------|
| Automated `tests/cache.test.js` | **PASS** |
| `/health` Redis | `enabled=true`, `ok=true`, `status=ready`, ~2–3 ms ping |
| Live `GET /api/v1/courses` after `FLUSHDB` | See table below |

| Metric | Value |
|--------|------:|
| First request (cache miss → MongoDB) | **~221 ms** |
| Subsequent warm hits (Redis) | **~4–16 ms** (warmAvg **13.76 ms**, 8 runs) |
| Script `coldAvgMs` (mixes 1 miss + 7 hits) | 33.79 ms |
| Script `warmAvgMs` | 13.76 ms |

Interpretation: after a cold miss, repeated course listing served from Redis roughly **15× faster** than the miss (~221 ms → ~14 ms) in this run. Numbers vary with Atlas latency and local load; re-run `bench:cache` before quoting elsewhere.

Do not claim a fixed production speedup without re-measuring on the target VPS.

## MongoDB indexes added

| Index | Collection | Optimizes |
|-------|------------|-----------|
| `{ status, deletedAt, isFeatured, sortOrder }` | courses | Featured listing |
| `{ status, deletedAt, categoryIds, publishedAt }` | courses | Public filtered listing |
| `{ courseId, status, deletedAt, dueDate }` | assignments | Student/course assignment lists |

Existing indexes on courses/assignments/quizzes were retained.
