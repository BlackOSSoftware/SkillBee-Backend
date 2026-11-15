import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { INSTRUCTOR_APP_STATUS } from '../models/InstructorApplication.js';
import { InstructorApplication } from '../models/InstructorApplication.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
);

const APPLICANTS = [
  {
    fullName: 'Priya Sharma',
    phone: '+91 98200 11223',
    email: 'priya.sharma@example.com',
    expertSubject: 'Pharmaceutical GMP',
    expertiseLevel: 'Expert',
    linkedinProfileUrl: 'https://www.linkedin.com/in/priya-sharma-gmp',
    comments:
      '12 years in pharmaceutical manufacturing QA. Led GMP audits for 3 FDA-approved plants and trained 200+ operators on documentation practices.',
    status: INSTRUCTOR_APP_STATUS.PENDING,
    daysAgo: 1,
  },
  {
    fullName: 'Arjun Mehta',
    phone: '+91 90040 55667',
    email: 'arjun.mehta@example.com',
    expertSubject: 'Computerized System Validation',
    expertiseLevel: 'Proficient',
    linkedinProfileUrl: 'https://www.linkedin.com/in/arjun-mehta-csv',
    comments:
      'CSV consultant for LIMS and MES platforms. URS, IQ/OQ/PQ protocols, 21 CFR Part 11 compliance.',
    status: INSTRUCTOR_APP_STATUS.PENDING,
    daysAgo: 2,
  },
  {
    fullName: 'Sneha Reddy',
    phone: '+91 98850 33445',
    email: 'sneha.reddy@example.com',
    expertSubject: 'Clinical Data Management System',
    expertiseLevel: 'Expert',
    linkedinProfileUrl: '',
    comments:
      'CDM lead with 9 years across Phase II/III trials. EDC setup, SDTM mapping, data cleaning workflows.',
    status: INSTRUCTOR_APP_STATUS.PENDING,
    daysAgo: 3,
  },
  {
    fullName: 'Vikram Singh',
    phone: '+91 98110 77889',
    email: 'vikram.singh@example.com',
    expertSubject: 'SAP S4 HANA',
    expertiseLevel: 'Competent',
    linkedinProfileUrl: 'https://www.linkedin.com/in/vikram-singh-sap',
    comments: 'SAP MM/SD consultant, 6 years in pharma distribution. Available for weekend batches.',
    status: INSTRUCTOR_APP_STATUS.PENDING,
    daysAgo: 4,
  },
  {
    fullName: 'Ananya Iyer',
    phone: '+91 98470 99001',
    email: 'ananya.iyer@example.com',
    expertSubject: 'Medical Writing',
    expertiseLevel: 'Proficient',
    linkedinProfileUrl: 'https://www.linkedin.com/in/ananya-iyer-medical-writing',
    comments:
      'Regulatory medical writer — CTDs, clinical study reports, publications. Former pharma R&D associate.',
    status: INSTRUCTOR_APP_STATUS.REVIEWING,
    daysAgo: 6,
    adminNotes: 'Strong portfolio; checking references before shortlist.',
  },
  {
    fullName: 'Rahul Verma',
    phone: '+91 98765 44332',
    email: 'rahul.verma@example.com',
    expertSubject: 'Pharmacovigilance',
    expertiseLevel: 'Expert',
    linkedinProfileUrl: '',
    comments: 'PV associate with 8 years in case processing, signal detection and PSUR writing.',
    status: INSTRUCTOR_APP_STATUS.REVIEWING,
    daysAgo: 8,
    adminNotes: 'Awaiting sample lecture feedback from curriculum team.',
  },
  {
    fullName: 'Kavita Nair',
    phone: '+91 98460 22110',
    email: 'kavita.nair@example.com',
    expertSubject: 'Laboratory Information Management System',
    expertiseLevel: 'Proficient',
    linkedinProfileUrl: 'https://www.linkedin.com/in/kavita-nair-lims',
    comments: 'LIMS implementation lead for 2 contract labs. Sample management, stability workflows.',
    status: INSTRUCTOR_APP_STATUS.SHORTLISTED,
    daysAgo: 10,
    adminNotes: 'Shortlisted — schedule demo class next week.',
  },
  {
    fullName: 'Mohammed Farhan',
    phone: '+91 90030 66554',
    email: 'm.farhan@example.com',
    expertSubject: 'Manufacturing Execution System',
    expertiseLevel: 'Competent',
    linkedinProfileUrl: '',
    comments: 'MES functional consultant, batch record review and electronic signatures.',
    status: INSTRUCTOR_APP_STATUS.SHORTLISTED,
    daysAgo: 12,
    adminNotes: 'Good fit for MES module; pending availability confirmation.',
  },
  {
    fullName: 'Deepika Joshi',
    phone: '+91 98220 88776',
    email: 'deepika.joshi@example.com',
    expertSubject: 'Clinical Research and Clinical Trial',
    expertiseLevel: 'Expert',
    linkedinProfileUrl: 'https://www.linkedin.com/in/deepika-joshi-clinical',
    comments: 'CRC with 10 years across oncology and cardiology trials. ICH-GCP certified.',
    status: INSTRUCTOR_APP_STATUS.APPROVED,
    daysAgo: 15,
    adminNotes: 'Approved — onboarding call scheduled.',
  },
  {
    fullName: 'Suresh Kumar',
    phone: '+91 98840 11220',
    email: 'suresh.kumar@example.com',
    expertSubject: 'Any Other Course',
    expertiseLevel: 'Beginner',
    linkedinProfileUrl: '',
    comments: 'Interested in teaching SQL basics for pharma analysts. Self-taught, building portfolio.',
    status: INSTRUCTOR_APP_STATUS.REJECTED,
    daysAgo: 18,
    adminNotes: 'Not enough teaching experience yet; encouraged to reapply after 6 months.',
  },
];

async function writeResumeFile() {
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(env.UPLOAD_ROOT, 'resumes', date);
  await fs.mkdir(dir, { recursive: true });
  const storedFileName = `${crypto.randomBytes(16).toString('hex')}.pdf`;
  await fs.writeFile(path.join(dir, storedFileName), MINIMAL_PDF);
  return {
    originalFileName: 'resume.pdf',
    storedFileName,
    storagePath: path.join('resumes', date, storedFileName).replace(/\\/g, '/'),
    mimeType: 'application/pdf',
    fileSize: MINIMAL_PDF.length,
  };
}

async function main() {
  await connectDatabase();

  const reviewer = await User.findOne({}).sort({ createdAt: 1 }).select('_id').populate('roleId', 'slug');
  const reviewerId = reviewer?._id ?? null;

  let created = 0;
  for (const a of APPLICANTS) {
    const exists = await InstructorApplication.findOne({ email: a.email, deletedAt: null });
    if (exists) {
      console.log(`  skip (exists): ${a.email}`);
      continue;
    }
    const createdAt = new Date(Date.now() - a.daysAgo * 24 * 60 * 60 * 1000);
    const reviewed = a.status !== INSTRUCTOR_APP_STATUS.PENDING;
    const resume = await writeResumeFile();
    const auditLog = [
      { action: 'submitted', actorId: null, at: createdAt },
    ];
    if (reviewed) {
      auditLog.push({
        action: 'status_changed',
        actorId: reviewerId,
        at: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
        meta: { from: INSTRUCTOR_APP_STATUS.PENDING, to: a.status },
      });
    }
    await InstructorApplication.create({
      fullName: a.fullName,
      phone: a.phone,
      email: a.email,
      expertSubject: a.expertSubject,
      expertiseLevel: a.expertiseLevel,
      resume,
      linkedinProfileUrl: a.linkedinProfileUrl,
      comments: a.comments,
      status: a.status,
      adminNotes: a.adminNotes ?? '',
      reviewedBy: reviewed ? reviewerId : null,
      reviewedAt: reviewed ? new Date(createdAt.getTime() + 2 * 60 * 60 * 1000) : null,
      auditLog,
      createdAt,
      updatedAt: createdAt,
    });
    created += 1;
    console.log(`  + ${a.fullName} (${a.status})`);
  }

  console.log(`Seeded ${created} instructor applications.`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
