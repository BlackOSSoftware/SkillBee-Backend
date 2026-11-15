import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { SeoRedirect } from '../models/SeoRedirect.js';
import { User } from '../models/User.js';

/**
 * Development-only seed for admin SEO redirect testing.
 * Idempotent: skips redirects whose sourcePath already exists.
 * Records are identifiable by the `/seed-` source prefix:
 *   SeoRedirect.deleteMany({ sourcePath: /^\/seed-/ })
 * Global SEO settings and page SEO records are auto-created by the
 * backend on first read — this script does not touch them.
 */
if (env.NODE_ENV === 'production') {
  console.error('seedSeo is development-only and refuses to run in production.');
  process.exit(1);
}

const REDIRECTS = [
  { sourcePath: '/seed-old-course-page', destinationPath: '/courses', redirectType: 301, isActive: true },
  { sourcePath: '/seed-legacy-blog', destinationPath: '/blog', redirectType: 301, isActive: true },
  { sourcePath: '/seed-temp-promo', destinationPath: '/pricing', redirectType: 302, isActive: true },
  { sourcePath: '/seed-inactive-rule', destinationPath: '/about', redirectType: 301, isActive: false },
];

async function main() {
  await connectDatabase();

  const admin = await User.findOne({}).sort({ createdAt: 1 }).select('_id');

  let created = 0;
  for (const r of REDIRECTS) {
    const exists = await SeoRedirect.findOne({ sourcePath: r.sourcePath });
    if (exists) {
      console.log(`  skip (exists): ${r.sourcePath}`);
      continue;
    }
    await SeoRedirect.create({
      ...r,
      createdBy: admin?._id ?? null,
      updatedBy: admin?._id ?? null,
      auditLog: [{ action: 'seed_created', actorId: admin?._id ?? null, at: new Date() }],
    });
    created += 1;
  }

  console.log(`Seeded ${created} redirects (${REDIRECTS.length - created} already existed).`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
