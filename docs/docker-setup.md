# Docker setup (SkillBee API + Redis)

MongoDB Atlas remains the primary database. Docker Compose runs **API + Redis only**.

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Production Node 22 image |
| `docker-compose.yml` | API + Redis (Redis not published publicly) |
| `docker-compose.dev.yml` | Redis-only for local `npm run dev` |
| `docker/redis/redis.conf` | Persistence, `allkeys-lru`, 256mb default |

## Local Redis for development

```bash
cd backend
docker compose -f docker-compose.dev.yml up -d
```

Set in `.env`:

```env
REDIS_ENABLED=true
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=skillbee-dev-redis-pass
```

Then `npm run dev`.

## Full stack containers

1. Copy `.env.example` → `.env` and set `MONGODB_URI`, JWT secrets, Redis password.
2. Set `REDIS_ENABLED=true`.
3. Build and start:

```bash
docker compose up -d --build
```

API: `http://localhost:5000`  
Redis: **internal only** (`redis:6379` on Docker network). Do not publish Redis in production.

## Health

- `GET /health` — includes Redis enabled/ok/latency
- `GET /api/v1/admin/system/cache-metrics` — admin-only hit/miss metrics

## Migration note (existing VPS / PM2)

Do **not** stop PM2/Nginx blindly. Recommended path:

1. Start Redis via `docker-compose.dev.yml` (or Redis container only) on the VPS.
2. Point the existing Node process at Redis with env vars.
3. Validate `/health` and regression tests.
4. Optionally move the API into Compose later with explicit approval.

## Security

- Redis password required (`--requirepass`)
- No public Redis port in production compose
- Cache values are disposable; MongoDB is source of truth
