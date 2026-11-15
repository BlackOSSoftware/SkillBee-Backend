import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { Faq } from '../models/Faq.js';
import { User } from '../models/User.js';

/**
 * Development-only seed for admin FAQs UI testing.
 * Idempotent: skips FAQs whose question already exists.
 * Records are identifiable by the `seed-faq-` question prefix:
 *   Faq.deleteMany({ question: /^seed-faq-/ })
 */
if (env.NODE_ENV === 'production') {
  console.error('seedFaqs is development-only and refuses to run in production.');
  process.exit(1);
}

const FAQS = [
  {
    question: 'seed-faq- How do I enroll in a course?',
    answer: '<p>Browse the catalog, open a course and click <strong>Enroll</strong>. Free courses start immediately; paid courses require checkout first.</p>',
    category: 'enrollment',
    status: 'published',
    isFeatured: true,
    displayOrder: 1,
  },
  {
    question: 'seed-faq- Can I get a refund after purchasing?',
    answer: '<p>Yes — refunds are available within 7 days of purchase if you have not completed more than 20% of the course content. Contact support with your order ID.</p>',
    category: 'billing',
    status: 'published',
    isFeatured: true,
    displayOrder: 2,
  },
  {
    question: 'seed-faq- Do certificates expire?',
    answer: '<p>Certificates do not expire, but some employers require renewal every 2–3 years. Check your course page for renewal options.</p>',
    category: 'certificates',
    status: 'published',
    displayOrder: 3,
  },
  {
    question: 'seed-faq- How do I reset my password?',
    answer: '<p>Use the <em>Forgot password</em> link on the sign-in page. A reset link is emailed to your registered address and expires in 30 minutes.</p>',
    category: 'account',
    status: 'published',
    displayOrder: 4,
  },
  {
    question: 'seed-faq- Are the courses self-paced?',
    answer: '<p>Most courses are fully self-paced. Live cohorts run on fixed schedules — the course page shows the format before you enroll.</p>',
    category: 'courses',
    status: 'published',
    displayOrder: 5,
  },
  {
    question: 'seed-faq- Can I download course videos?',
    answer: '<p>Video downloads are not supported. Streams are available on mobile and desktop while your enrollment is active.</p>',
    category: 'courses',
    status: 'draft',
    displayOrder: 6,
  },
  {
    question: 'seed-faq- How do I become an instructor?',
    answer: '<p>Submit an instructor application from your profile. Our team reviews applications within 5 business days.</p>',
    category: 'instructors',
    status: 'draft',
    displayOrder: 7,
  },
  {
    question: 'seed-faq- What payment methods are accepted?',
    answer: '<p>We accept credit/debit cards, UPI, net banking and wallets through our payment partners. All payments are PCI-DSS compliant.</p>',
    category: 'billing',
    status: 'published',
    displayOrder: 8,
  },
  {
    question: 'seed-faq- Is there a mobile app?',
    answer: '<p>The web app is fully responsive. Native iOS and Android apps are on the roadmap for next quarter.</p>',
    category: 'general',
    status: 'published',
    displayOrder: 9,
  },
  {
    question: 'seed-faq- How do I contact support?',
    answer: '<p>Email support@skillbee.example or use the in-app chat. Average first response time is under 4 hours on business days.</p>',
    category: 'support',
    status: 'published',
    displayOrder: 10,
  },
];

async function main() {
  await connectDatabase();

  const admin = await User.findOne({}).sort({ createdAt: 1 }).select('_id');
  if (!admin) {
    console.error('No user found — run the app once so an admin account exists.');
    await disconnectDatabase();
    process.exit(1);
  }

  let created = 0;
  for (const f of FAQS) {
    const exists = await Faq.findOne({ question: f.question, deletedAt: null });
    if (exists) {
      console.log(`  skip (exists): ${f.question}`);
      continue;
    }
    const createdAt = new Date(Date.now() - f.displayOrder * 2 * 24 * 60 * 60 * 1000);
    await Faq.create({
      question: f.question,
      answer: f.answer,
      category: f.category,
      status: f.status,
      isFeatured: f.isFeatured ?? false,
      displayOrder: f.displayOrder,
      createdBy: admin._id,
      updatedBy: admin._id,
      createdAt,
      updatedAt: createdAt,
    });
    created += 1;
  }

  console.log(`Seeded ${created} FAQs (${FAQS.length - created} already existed).`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
