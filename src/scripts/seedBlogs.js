import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { Blog } from '../models/Blog.js';
import { BlogCategory } from '../models/BlogCategory.js';
import { User } from '../models/User.js';

/**
 * Development-only seed for admin Blog Management UI testing.
 * Idempotent: skips categories/blogs that already exist.
 * Records are identifiable by the `seed-` slug prefix:
 *   BlogCategory.deleteMany({ slug: /^seed-/ })
 *   Blog.deleteMany({ slug: /^seed-/ })
 */
if (env.NODE_ENV === 'production') {
  console.error('seedBlogs is development-only and refuses to run in production.');
  process.exit(1);
}

const CATEGORIES = [
  { name: 'Career Growth', slug: 'seed-career-growth', description: 'Articles about career development and upskilling.' },
  { name: 'Industry Insights', slug: 'seed-industry-insights', description: 'Trends and news from the life-sciences industry.' },
  { name: 'Learning Tips', slug: 'seed-learning-tips', description: 'Study techniques and learning best practices.' },
  { name: 'Product Updates', slug: 'seed-product-updates', description: 'What is new on the Skillbee platform.' },
];

const POSTS = [
  {
    title: 'seed- How to choose the right GMP certification for your career',
    slug: 'seed-gmp-certification-guide',
    excerpt: 'GMP, GDP, GLP — the acronyms are everywhere. Here is how to pick the certification that actually moves your career forward.',
    content: `<h2>Start with your role</h2><p>Quality assurance, production and validation roles each value different certifications. Map the job descriptions you are targeting before enrolling.</p><h2>Check employer preferences</h2><p>Many pharma employers list preferred certifying bodies on their career pages. A quick search saves months of wasted effort.</p><h2>Budget for renewal</h2><p>Most GMP certifications require renewal every 2–3 years. Factor that into the total cost, not just the upfront fee.</p>`,
    tags: ['gmp', 'career', 'certification'],
    categorySlugs: ['seed-career-growth', 'seed-industry-insights'],
    status: 'published',
    isFeatured: true,
    daysAgo: 30,
    seo: { seoTitle: 'GMP Certification Guide for Pharma Careers', metaDescription: 'How to choose the right GMP certification for your pharma career — roles, employers and renewal costs explained.', schemaType: 'BlogPosting' },
  },
  {
    title: 'seed- 5 study techniques that actually improve retention',
    slug: 'seed-study-techniques-retention',
    excerpt: 'Rereading notes feels productive but is not. These evidence-backed techniques deliver measurably better retention.',
    content: `<h2>Spaced repetition</h2><p>Review material at increasing intervals — day 1, day 3, day 7, day 14. Apps like Anki automate this.</p><h2>Active recall</h2><p>Close the book and write down what you remember before checking. The struggle is where learning happens.</p><h2>Interleaving</h2><p>Mix topics in one session instead of blocking. It feels harder but produces stronger long-term memory.</p><h2>Elaboration</h2><p>Explain concepts in your own words, ideally to someone else. Teaching exposes gaps instantly.</p><h2>Practice testing</h2><p>Past papers and quizzes beat passive review for exam preparation almost every time.</p>`,
    tags: ['learning', 'study', 'productivity'],
    categorySlugs: ['seed-learning-tips'],
    status: 'published',
    isFeatured: true,
    daysAgo: 18,
    seo: { seoTitle: 'Study Techniques That Improve Retention', metaDescription: 'Five evidence-backed study techniques — spaced repetition, active recall, interleaving, elaboration and practice testing.', schemaType: 'BlogPosting' },
  },
  {
    title: 'seed- Inside our new quiz engine: what changed and why',
    slug: 'seed-quiz-engine-update',
    excerpt: 'Faster load times, better analytics and a rebuilt question editor. Here is what shipped in the latest platform release.',
    content: `<h2>What changed</h2><p>The quiz engine was rebuilt on a streaming pipeline. Question banks now load in under 200ms regardless of size.</p><h2>New analytics</h2><p>Instructors get per-question difficulty scores and distractor analysis — see which wrong answers students actually pick.</p><h2>Editor improvements</h2><p>The question editor now supports LaTeX, image options and bulk import from CSV.</p>`,
    tags: ['product', 'quizzes', 'release'],
    categorySlugs: ['seed-product-updates'],
    status: 'published',
    isFeatured: false,
    daysAgo: 9,
    seo: { seoTitle: 'New Quiz Engine Release Notes', metaDescription: 'Faster quizzes, better analytics and a rebuilt question editor — what changed in the latest Skillbee release.', schemaType: 'BlogPosting' },
  },
  {
    title: 'seed- Data integrity regulations: what auditors look for in 2026',
    slug: 'seed-data-integrity-audit-2026',
    excerpt: 'Audit findings are trending toward data integrity. Here is what inspectors now expect from CSV and QA teams.',
    content: `<h2>The ALCOA+ checklist</h2><p>Attributable, Legible, Contemporaneous, Original, Accurate — plus Complete, Consistent, Enduring and Available. Every record must satisfy all nine.</p><h2>Common findings</h2><p>Shared login credentials, backdated entries and uncontrolled spreadsheet templates remain the top three citations.</p><h2>What to do</h2><p>Implement audit trails on every system, enforce unique user accounts and validate spreadsheet imports automatically.</p>`,
    tags: ['gmp', 'data-integrity', 'audit'],
    categorySlugs: ['seed-industry-insights'],
    status: 'published',
    isFeatured: false,
    daysAgo: 4,
    seo: { seoTitle: 'Data Integrity Audit Trends 2026', metaDescription: 'What auditors look for in data integrity inspections — ALCOA+ requirements and the most common findings.', schemaType: 'BlogPosting' },
  },
  {
    title: 'seed- Draft: Upcoming live cohort on pharmacovigilance',
    slug: 'seed-pv-cohort-announcement',
    excerpt: 'Draft announcement for the January pharmacovigilance live cohort — publish after dates are confirmed.',
    content: `<p>We are planning a live pharmacovigilance cohort starting in January. Details TBD.</p>`,
    tags: ['pharmacovigilance', 'cohort'],
    categorySlugs: ['seed-product-updates'],
    status: 'draft',
    isFeatured: false,
    daysAgo: 1,
    seo: {},
  },
  {
    title: 'seed- Archived: Platform maintenance retrospective 2024',
    slug: 'seed-maintenance-retrospective-2024',
    excerpt: 'A look back at last year\'s infrastructure work — what we fixed, what we learned.',
    content: `<p>Archived post kept for reference. Covers the 2024 database migration and CDN rollout.</p>`,
    tags: ['engineering', 'archive'],
    categorySlugs: [],
    status: 'archived',
    isFeatured: false,
    daysAgo: 200,
    seo: {},
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

  const categoryIds = new Map();
  for (const c of CATEGORIES) {
    let cat = await BlogCategory.findOne({ slug: c.slug });
    if (cat) {
      console.log(`  skip category (exists): ${c.slug}`);
    } else {
      cat = await BlogCategory.create({ ...c, status: 'published' });
      console.log(`  created category: ${c.slug}`);
    }
    categoryIds.set(c.slug, cat._id);
  }

  let created = 0;
  for (const p of POSTS) {
    const exists = await Blog.findOne({ slug: p.slug });
    if (exists) {
      console.log(`  skip post (exists): ${p.slug}`);
      continue;
    }
    const createdAt = new Date(Date.now() - p.daysAgo * 24 * 60 * 60 * 1000);
    const published = p.status === 'published';
    await Blog.create({
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      content: p.content,
      authorId: admin._id,
      categoryIds: p.categorySlugs.map((s) => categoryIds.get(s)).filter(Boolean),
      tags: p.tags,
      status: p.status,
      publishedAt: published ? createdAt : null,
      readingTime: Math.max(1, Math.round(p.content.replace(/<[^>]+>/g, ' ').split(/\s+/).length / 200)),
      viewsCount: published ? Math.floor(Math.random() * 900) + 40 : 0,
      isFeatured: p.isFeatured,
      seo: p.seo ?? {},
      createdBy: admin._id,
      updatedBy: admin._id,
      createdAt,
      updatedAt: createdAt,
    });
    created += 1;
  }

  console.log(`Seeded ${created} blog posts (${POSTS.length - created} already existed).`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
