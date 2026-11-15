import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { REFERRAL_STATUS, Referral } from '../models/Referral.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';

/**
 * Development-only seed for admin Referrals UI testing.
 * Idempotent: skips records whose referrerEmail already exists.
 * Records are identifiable by the `seed-referral-` email prefix and can be
 * removed safely without touching real referrals:
 *   Referral.deleteMany({ referrerEmail: /^seed-referral-/ })
 */
if (env.NODE_ENV === 'production') {
  console.error('seedReferrals is development-only and refuses to run in production.');
  process.exit(1);
}

const REFERRERS = [
  { name: 'Aarav Kapoor', email: 'seed-referral-aarav@example.com', phone: '+91 98111 22334' },
  { name: 'Diya Patel', email: 'seed-referral-diya@example.com', phone: '+91 98222 33445' },
  { name: 'Rohan Desai', email: 'seed-referral-rohan@example.com', phone: '+91 98333 44556' },
  { name: 'Ishita Bose', email: 'seed-referral-ishita@example.com', phone: '+91 98444 55667' },
  { name: 'Kabir Malhotra', email: 'seed-referral-kabir@example.com', phone: '+91 98555 66778' },
  { name: 'Meera Krishnan', email: 'seed-referral-meera@example.com', phone: '+91 98666 77889' },
  { name: 'Aditya Nair', email: 'seed-referral-aditya@example.com', phone: '+91 98777 88990' },
  { name: 'Sara Thomas', email: 'seed-referral-sara@example.com', phone: '+91 98888 99001' },
];

const FRIENDS = [
  { name: 'Nikhil Sharma', phone: '+91 90000 11111' },
  { name: 'Pooja Reddy', phone: '+91 90000 22222' },
  { name: 'Sanjay Gupta', phone: '+91 90000 33333' },
  { name: 'Anjali Menon', phone: '+91 90000 44444' },
  { name: 'Vivek Choudhary', phone: '+91 90000 55555' },
  { name: 'Neha Kulkarni', phone: '+91 90000 66666' },
  { name: 'Farhan Ali', phone: '+91 90000 77777' },
  { name: 'Divya Subramanian', phone: '+91 90000 88888' },
  { name: 'Manish Tiwari', phone: '+91 90000 99999' },
  { name: 'Kavya Pillai', phone: '+91 90001 00000' },
];

const MESSAGES = [
  'My colleague is interested in the GMP course — can you reach out?',
  'Friend wants to upskill in clinical data management.',
  'Referred for the pharmacovigilance batch starting next month.',
  '',
  'Heard great things about the platform, wants to try the free courses first.',
];

const ADMIN_NOTES = [
  'Called the friend — interested in SQL course, follow up Friday.',
  'Verified referrer is an existing student; reward eligible.',
  'Friend already has an account; merged referral manually.',
  '',
  'Duplicate of earlier referral — kept for audit.',
];

const STATUSES = [
  REFERRAL_STATUS.PENDING,
  REFERRAL_STATUS.PENDING,
  REFERRAL_STATUS.PENDING,
  REFERRAL_STATUS.CONTACTED,
  REFERRAL_STATUS.CONTACTED,
  REFERRAL_STATUS.CONVERTED,
  REFERRAL_STATUS.REJECTED,
];

async function main() {
  await connectDatabase();

  const handler = await User.findOne({}).sort({ createdAt: 1 }).select('_id').populate('roleId', 'slug');
  const handlerId = handler?._id ?? null;

  let created = 0;
  const total = 26; // enough rows to exercise pagination at limit=10/20
  for (let i = 0; i < total; i += 1) {
    const referrer = REFERRERS[i % REFERRERS.length];
    const friend = FRIENDS[i % FRIENDS.length];
    const email = `${referrer.email.split('@')[0]}-${i}@example.com`;
    const exists = await Referral.findOne({ referrerEmail: email, deletedAt: null });
    if (exists) {
      console.log(`  skip (exists): ${email}`);
      continue;
    }
    const status = STATUSES[i % STATUSES.length];
    const handled = status !== REFERRAL_STATUS.PENDING;
    const createdAt = new Date(Date.now() - (i * 1.7 + 0.5) * 24 * 60 * 60 * 1000);
    await Referral.create({
      referrerName: referrer.name,
      referrerEmail: email,
      referrerPhone: referrer.phone,
      friendName: friend.name,
      friendPhone: friend.phone,
      message: MESSAGES[i % MESSAGES.length],
      status,
      adminNotes: ADMIN_NOTES[i % ADMIN_NOTES.length],
      handledBy: handled ? handlerId : null,
      handledAt: handled ? new Date(createdAt.getTime() + 26 * 60 * 60 * 1000) : null,
      createdAt,
      updatedAt: createdAt,
    });
    created += 1;
  }

  console.log(`Seeded ${created} referrals (${total - created} already existed).`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
