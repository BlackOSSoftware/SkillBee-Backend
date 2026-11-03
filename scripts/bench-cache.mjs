/**
 * Lightweight cache benchmark against a running API.
 * Usage:
 *   API_BASE=http://127.0.0.1:5000/api/v1 node scripts/bench-cache.mjs
 *
 * Reports wall-clock timings for public course listing (cold vs warm when Redis on).
 * Does not invent speedup claims — prints measured ms only.
 */
import dotenv from 'dotenv';

dotenv.config();

const BASE = process.env.API_BASE || 'http://127.0.0.1:5000/api/v1';
const PATH = process.env.BENCH_PATH || '/courses';
const RUNS = Number(process.env.BENCH_RUNS || 5);

async function timed(label, fn) {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  return { label, ms, status: result.status, ok: result.ok };
}

async function hit(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, ok: res.ok, body: await res.text() };
}

async function main() {
  console.log('Bench target', `${BASE}${PATH}`);
  console.log('Runs', RUNS);

  const health = await hit('/../health'.replace('/api/v1/../health', '/health')).catch(() => null);
  // Prefer absolute health
  const healthRes = await fetch(`${BASE.replace(/\/api\/v1$/, '')}/health`);
  const healthJson = await healthRes.json();
  console.log('Redis health:', JSON.stringify(healthJson.data?.redis || healthJson));

  const cold = [];
  for (let i = 0; i < RUNS; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    cold.push(await timed(`cold-${i + 1}`, () => hit(PATH)));
  }

  const warm = [];
  for (let i = 0; i < RUNS; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    warm.push(await timed(`warm-${i + 1}`, () => hit(PATH)));
  }

  const avg = (rows) => rows.reduce((s, r) => s + r.ms, 0) / rows.length;
  console.log(
    JSON.stringify(
      {
        path: PATH,
        firstMissMs: Number(cold[0].ms.toFixed(2)),
        coldAvgMs: Number(avg(cold).toFixed(2)),
        warmAvgMs: Number(avg(warm).toFixed(2)),
        cold,
        warm,
        note: 'Flush Redis before run for a true miss. firstMissMs ≈ Mongo; warmAvgMs ≈ Redis hits.',
      },
      null,
      2
    )
  );
  void health;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
