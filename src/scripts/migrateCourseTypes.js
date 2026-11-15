/**
 * Backfill courseType on legacy Course documents.
 *
 * Safe strategy: documents without courseType are resolved from pricing.type
 * (free → FREE, otherwise → PRE_RECORDED). LIVE_SESSION is never inferred —
 * it must be set explicitly by an admin.
 *
 * Usage:
 *   node src/scripts/migrateCourseTypes.js          # dry-run (default)
 *   node src/scripts/migrateCourseTypes.js --apply  # write changes
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Course } from '../models/Course.js';

const apply = process.argv.includes('--apply');

async function main() {
  await connectDatabase();

  const legacy = await Course.find({
    deletedAt: null,
    $or: [{ courseType: null }, { courseType: { $exists: false } }],
  })
    .select('_id title slug pricing.type courseType')
    .lean();

  console.log(`Found ${legacy.length} course(s) without courseType`);

  let free = 0;
  let preRecorded = 0;
  for (const course of legacy) {
    const type = course.pricing?.type === 'free' ? 'FREE' : 'PRE_RECORDED';
    if (type === 'FREE') free += 1;
    else preRecorded += 1;
    console.log(`  ${course.slug} → ${type}`);
    if (apply) {
      await Course.updateOne({ _id: course._id }, { $set: { courseType: type } });
    }
  }

  console.log(
    `${apply ? 'Applied' : 'Dry-run'}: ${free} FREE, ${preRecorded} PRE_RECORDED` +
      (apply ? '' : ' (pass --apply to write)')
  );

  await disconnectDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
