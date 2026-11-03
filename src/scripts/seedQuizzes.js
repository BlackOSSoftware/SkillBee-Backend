/**
 * Development-only quiz seed for SkillBee Phase 5.
 * Idempotent by quiz slug + isDemoSeed. Does NOT invent student attempts or payments.
 * Refuses production unless SEED_ALLOW_PRODUCTION=true.
 *
 * These records are demo content — NOT WordPress/Tutor LMS imports.
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { COURSE_STATUS, QUIZ_STATUS } from '../config/security.js';
import { Course } from '../models/Course.js';
import { Permission } from '../models/Permission.js';
import { QuestionBank } from '../models/QuestionBank.js';
import { Quiz } from '../models/Quiz.js';
import { QuizQuestion } from '../models/QuizQuestion.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { ensureUniqueQuizSlug } from '../modules/quizzes/utils/slug.js';

const COURSE_SLUG = 'computerized-system-validation-csv-csa-demo';

function mcq(text, options, correctIndex, extra = {}) {
  const opts = options.map((t, i) => ({
    id: `opt${i + 1}`,
    text: t,
    sortOrder: i,
  }));
  return {
    questionText: text,
    questionType: 'multiple_choice',
    marks: extra.marks ?? 1,
    negativeMarks: extra.negativeMarks ?? 0.25,
    options: opts,
    correctOptionIds: [opts[correctIndex].id],
    explanation: extra.explanation || '',
    difficulty: extra.difficulty || 'medium',
    tags: extra.tags || ['csv'],
  };
}

function multi(text, options, correctIndexes, extra = {}) {
  const opts = options.map((t, i) => ({ id: `opt${i + 1}`, text: t, sortOrder: i }));
  return {
    questionText: text,
    questionType: 'multiple_select',
    marks: extra.marks ?? 2,
    negativeMarks: extra.negativeMarks ?? 0.5,
    options: opts,
    correctOptionIds: correctIndexes.map((i) => opts[i].id),
    explanation: extra.explanation || '',
    difficulty: extra.difficulty || 'medium',
    tags: extra.tags || ['csv'],
  };
}

function tf(text, correctAnswer, extra = {}) {
  return {
    questionText: text,
    questionType: 'true_false',
    marks: 1,
    negativeMarks: 0.25,
    correctAnswer,
    explanation: extra.explanation || '',
    difficulty: extra.difficulty || 'easy',
    tags: extra.tags || ['csv'],
  };
}

function short(text, acceptedAnswers, extra = {}) {
  return {
    questionText: text,
    questionType: 'short_answer',
    marks: 1,
    acceptedAnswers,
    answerMatchingMode: extra.mode || 'case_insensitive',
    explanation: extra.explanation || '',
    difficulty: extra.difficulty || 'medium',
    tags: extra.tags || ['csv'],
  };
}

function long(text, extra = {}) {
  return {
    questionText: text,
    questionType: 'long_answer',
    marks: extra.marks ?? 5,
    gradingMode: 'manual',
    gradingRubric: extra.rubric || [
      { criterion: 'Accuracy', maximumMarks: 3, description: 'Technical correctness' },
      { criterion: 'Clarity', maximumMarks: 2, description: 'Clear explanation' },
    ],
    explanation: extra.explanation || '',
    difficulty: 'hard',
    tags: extra.tags || ['csv', 'essay'],
  };
}

function blanks(text, blankDefs, extra = {}) {
  const marks = blankDefs.reduce((s, b) => s + b.marks, 0);
  return {
    questionText: text,
    questionType: 'fill_in_the_blanks',
    marks,
    blanks: blankDefs.map((b, i) => ({
      id: b.id || `blank${i + 1}`,
      acceptedAnswers: b.acceptedAnswers,
      caseSensitive: Boolean(b.caseSensitive),
      marks: b.marks,
    })),
    explanation: extra.explanation || '',
    difficulty: extra.difficulty || 'medium',
    tags: extra.tags || ['csv'],
  };
}

const QUIZ_DEFS = [
  {
    title: 'Introduction to CSV',
    slug: 'intro-to-csv-demo',
    description: 'Development seed quiz — Introduction to Computerized System Validation',
    questions: [
      mcq(
        'What does CSV stand for in pharmaceutical computerized system validation?',
        [
          'Computerized System Validation',
          'Computer System Verification',
          'Controlled Software Validation',
          'Computerized Software Verification',
        ],
        0,
        {
          explanation:
            'CSV is the process of establishing documented evidence that a computerized system performs consistently according to its intended use.',
          tags: ['csv', 'basics'],
        }
      ),
      mcq(
        'Which industry commonly applies CSV under GxP regulations?',
        ['Fashion retail', 'Pharmaceuticals', 'Food delivery only', 'Social media'],
        1,
        { explanation: 'Pharma and life sciences apply CSV under GxP.', tags: ['gxp'] }
      ),
      tf(
        'CSV aims to provide documented evidence that a system meets intended use.',
        true,
        { explanation: 'Documented evidence is central to CSV.' }
      ),
      short('Name the three-letter acronym for Good Manufacturing Practice.', ['GMP', 'gmp'], {
        explanation: 'GMP is Good Manufacturing Practice.',
      }),
      multi(
        'Which are typical drivers for CSV?',
        ['Patient safety', 'Data integrity', 'Marketing aesthetics', 'Regulatory compliance'],
        [0, 1, 3],
        { explanation: 'Safety, integrity, and compliance drive CSV.' }
      ),
      blanks(
        'ALCOA+ includes Attributable, Legible, Contemporaneous, Original, and _____.',
        [{ acceptedAnswers: ['Accurate', 'accurate'], marks: 1 }],
        { explanation: 'Accurate completes the classic ALCOA set before the “+” attributes.' }
      ),
      long(
        'Explain why computerized systems in regulated environments require validation.',
        {
          explanation: 'Manual grading demo — seed content only.',
        }
      ),
      mcq(
        'Which document typically captures user needs for a system?',
        ['URS', 'Invoice', 'Blog post', 'Style guide'],
        0,
        { explanation: 'User Requirement Specification (URS).' }
      ),
      tf('Informal screenshots alone are sufficient CSV evidence.', false, {
        explanation: 'Formal documented evidence is required.',
      }),
      short('What does CSA commonly stand for in FDA guidance context?', [
        'Computer Software Assurance',
        'computer software assurance',
      ]),
    ],
  },
  {
    title: 'GAMP 5 Fundamentals',
    slug: 'gamp-5-fundamentals-demo',
    description: 'Development seed quiz — GAMP 5',
    questions: [
      mcq(
        'GAMP 5 emphasizes which approach?',
        ['Risk-based', 'Random testing only', 'No documentation', 'Marketing-first'],
        0,
        { tags: ['gamp5'] }
      ),
      multi(
        'Which are GAMP software categories (simplified)?',
        ['Infrastructure software', 'Non-configured', 'Configured', 'Custom', 'Fashion OS'],
        [0, 1, 2, 3]
      ),
      tf('Higher risk systems generally need more rigorous controls.', true),
      short('Expand the acronym GAMP.', ['Good Automated Manufacturing Practice', 'good automated manufacturing practice']),
      mcq(
        'Custom (Category 5) software typically requires:',
        ['Least validation effort', 'Most rigorous validation', 'No SOPs', 'Only marketing review'],
        1
      ),
      blanks(
        'GAMP stands for Good _____ Manufacturing Practice.',
        [{ acceptedAnswers: ['Automated', 'automated'], marks: 1 }]
      ),
      long('Describe how a risk-based approach influences testing depth in GAMP 5.'),
      tf('Infrastructure software never needs any controls.', false),
      mcq(
        'Supplier assessment is relevant when:',
        ['Buying configured/custom systems', 'Never', 'Only for office chairs', 'Only for logo design'],
        0
      ),
      short('Name one output of a risk assessment (e.g., risk score or control).', [
        'risk score',
        'Risk score',
        'controls',
        'Controls',
        'mitigation',
      ]),
    ],
  },
  {
    title: 'Validation Documentation',
    slug: 'validation-documentation-demo',
    description: 'Development seed quiz — validation docs',
    questions: [
      mcq(
        'URS primarily documents:',
        ['User requirements', 'Server passwords', 'Marketing slogans', 'Coffee preferences'],
        0
      ),
      mcq(
        'IQ typically verifies:',
        ['Installation against specs', 'Marketing ROI', 'Office layout', 'Social engagement'],
        0
      ),
      multi(
        'Common validation documents include:',
        ['URS', 'FS', 'IQ/OQ/PQ protocols', 'Personal diary'],
        [0, 1, 2]
      ),
      tf('Traceability matrices link requirements to tests.', true),
      short('Expand OQ.', ['Operational Qualification', 'operational qualification']),
      blanks(
        'PQ stands for _____ Qualification.',
        [{ acceptedAnswers: ['Performance', 'performance'], marks: 1 }]
      ),
      long('Outline the purpose of a Validation Summary Report.'),
      tf('Change control is unrelated to validated systems.', false),
      mcq(
        'FS typically translates URS into:',
        ['Functional design/behavior', 'HR policies', 'Brand colors', 'Travel itineraries'],
        0
      ),
      short('Name the document that often closes a validation project.', [
        'Validation Summary Report',
        'VSR',
        'validation summary report',
      ]),
    ],
  },
  {
    title: 'Risk Assessment',
    slug: 'risk-assessment-demo',
    description: 'Development seed quiz — risk assessment',
    questions: [
      mcq(
        'Risk is often expressed as a function of:',
        ['Severity and likelihood', 'Font size', 'Logo color', 'Office temperature'],
        0
      ),
      multi(
        'Risk controls may include:',
        ['Technical controls', 'Procedural controls', 'Training', 'Ignoring SOPs'],
        [0, 1, 2]
      ),
      tf('Patient safety impact elevates risk priority.', true),
      short('Name a common qualitative risk scale endpoint (e.g., High).', ['High', 'high', 'Medium', 'Low']),
      blanks(
        'FMEA stands for Failure Mode and Effects _____.',
        [{ acceptedAnswers: ['Analysis', 'analysis'], marks: 1 }]
      ),
      long('Explain how residual risk is accepted or mitigated after controls.'),
      mcq(
        'Data integrity failures can impact:',
        ['Product quality decisions', 'Only cafeteria menus', 'Only parking', 'Only wallpaper'],
        0
      ),
      tf('Risk assessment is a one-time activity never revisited.', false),
      multi(
        'Inputs to risk assessment may include:',
        ['Process knowledge', 'System criticality', 'Regulatory expectations', 'Random memes'],
        [0, 1, 2]
      ),
      short('What does RPN commonly stand for in FMEA?', [
        'Risk Priority Number',
        'risk priority number',
      ]),
    ],
  },
  {
    title: 'Data Integrity and ALCOA+',
    slug: 'data-integrity-alcoa-demo',
    description: 'Development seed quiz — data integrity',
    questions: [
      mcq(
        'ALCOA+ “Attributable” means:',
        ['Who performed/recorded the action is known', 'Data is pretty', 'Data is encrypted only', 'Data is deleted'],
        0,
        { tags: ['alcoa', 'data-integrity'] }
      ),
      multi(
        'ALCOA+ principles include:',
        ['Attributable', 'Legible', 'Contemporaneous', 'Original', 'Accurate', 'Irrelevant'],
        [0, 1, 2, 3, 4]
      ),
      tf('Audit trails support data integrity expectations.', true),
      short('Expand ALCOA (first letter meanings are enough as phrase).', [
        'Attributable Legible Contemporaneous Original Accurate',
        'attributable legible contemporaneous original accurate',
      ]),
      blanks(
        'Data should be recorded _____ (at the time of the activity).',
        [{ acceptedAnswers: ['Contemporaneously', 'contemporaneously', 'contemporaneous'], marks: 1 }]
      ),
      long('Discuss how hybrid paper-electronic systems create data integrity risks.'),
      mcq(
        'Shared generic login accounts typically weaken:',
        ['Attributability', 'CPU speed', 'Screen brightness', 'Cable management'],
        0
      ),
      tf('Backdating records without justification supports integrity.', false),
      multi(
        'Good practices include:',
        ['Unique user IDs', 'Secure audit trails', 'Controlled changes', 'Password sharing'],
        [0, 1, 2]
      ),
      short('Name one “+” attribute often listed with ALCOA+ (e.g., Complete).', [
        'Complete',
        'Consistent',
        'Enduring',
        'Available',
        'complete',
        'consistent',
        'enduring',
        'available',
      ]),
    ],
  },
];

async function seed() {
  if (env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    console.error('Refusing to seed quizzes in production. Set SEED_ALLOW_PRODUCTION=true to override.');
    process.exit(1);
  }

  await connectDatabase();
  await Permission.ensureDefaults();
  await Role.ensureDefaults();

  const course = await Course.findOne({ slug: COURSE_SLUG, deletedAt: null });
  if (!course) {
    console.error(
      `Course ${COURSE_SLUG} not found. Run npm run seed:curriculum first.`
    );
    process.exit(1);
  }

  let admin = await User.findOne({ email: 'admin@skillbee.local' });
  if (!admin) {
    admin = await User.findOne({}).sort({ createdAt: 1 });
  }
  if (!admin) {
    console.error('No user found to own seeded quizzes.');
    process.exit(1);
  }

  // Sample bank items (demo)
  const bankSeedKey = 'CSV stands for (bank demo)';
  let bank = await QuestionBank.findOne({ questionText: bankSeedKey, isDemoSeed: true });
  if (!bank) {
    bank = await QuestionBank.create({
      questionText: bankSeedKey,
      questionType: 'multiple_choice',
      options: [
        { id: 'b1', text: 'Computerized System Validation', sortOrder: 0 },
        { id: 'b2', text: 'Computer System Verification', sortOrder: 1 },
      ],
      correctOptionIds: ['b1'],
      defaultMarks: 1,
      explanation: 'Bank demo item — not a WordPress import.',
      category: 'csv-basics',
      tags: ['csv', 'bank-demo'],
      difficulty: 'easy',
      createdBy: admin._id,
      updatedBy: admin._id,
      isDemoSeed: true,
    });
    console.log('Created question bank demo item');
  }

  for (const def of QUIZ_DEFS) {
    let quiz = await Quiz.findOne({ courseId: course._id, slug: def.slug, isDemoSeed: true });
    if (!quiz) {
      const slug = await ensureUniqueQuizSlug(Quiz, course._id, def.slug);
      quiz = await Quiz.create({
        title: def.title,
        slug,
        description: def.description,
        instructions: 'Development seed quiz. Answer carefully. Server-timed when published with a limit.',
        courseId: course._id,
        timeLimitSeconds: 1800,
        passingPercentage: 60,
        maximumAttempts: 2,
        randomizeQuestions: true,
        randomizeAnswers: true,
        showResults: 'after_submission',
        showCorrectAnswers: true,
        showExplanation: true,
        negativeMarkingEnabled: true,
        negativeMarksPerWrongAnswer: 0.25,
        allowResume: true,
        requireAllQuestions: false,
        status: QUIZ_STATUS.DRAFT,
        createdBy: admin._id,
        updatedBy: admin._id,
        isDemoSeed: true,
      });
      console.log(`Created quiz: ${quiz.title}`);
    } else {
      console.log(`Quiz exists: ${quiz.title}`);
    }

    const existingCount = await QuizQuestion.countDocuments({
      quizId: quiz._id,
      deletedAt: null,
    });
    if (existingCount === 0) {
      let order = 0;
      let total = 0;
      for (const q of def.questions) {
        await QuizQuestion.create({
          ...q,
          quizId: quiz._id,
          sortOrder: order++,
          status: 'active',
          createdBy: admin._id,
          updatedBy: admin._id,
        });
        total += Number(q.marks) || 0;
      }
      await Quiz.updateOne(
        { _id: quiz._id },
        {
          $set: {
            totalMarks: total,
            status: course.status === COURSE_STATUS.PUBLISHED ? QUIZ_STATUS.PUBLISHED : QUIZ_STATUS.DRAFT,
            publishedAt: course.status === COURSE_STATUS.PUBLISHED ? new Date() : null,
          },
        }
      );
      console.log(`  Added ${def.questions.length} questions (totalMarks=${total})`);
    } else {
      console.log(`  Questions already present (${existingCount})`);
    }
  }

  console.log('Quiz seed complete (development demo data only).');
  await disconnectDatabase();
}

seed().catch(async (err) => {
  console.error(err);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
