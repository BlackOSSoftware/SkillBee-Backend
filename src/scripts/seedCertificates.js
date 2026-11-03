/**
 * Dev-only certificate seed. Never represents WordPress history.
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { CertificateTemplate } from '../models/CertificateTemplate.js';
import { Course } from '../models/Course.js';

async function main() {
  if (env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    console.error('Refusing certificate seed in production');
    process.exit(1);
  }
  await connectDatabase();

  let template = await CertificateTemplate.findOne({
    templateCode: 'skillbee-default',
    deletedAt: null,
  });
  if (!template) {
    template = await CertificateTemplate.create({
      name: 'SkillBee Default',
      templateCode: 'skillbee-default',
      organizationName: 'SkillBee',
      certificateTitle: 'Certificate of Completion',
      authorizedSignatoryName: 'Academic Director',
      authorizedSignatoryDesignation: 'SkillBee LMS',
      status: 'active',
      isDefault: true,
      isDemoSeed: true,
    });
  }

  const course = await Course.findOne({ slug: process.env.SEED_ENROLLMENT_COURSE_SLUG || 'csv-csa-demo' });
  if (course) {
    course.certificate = {
      ...(course.certificate?.toObject?.() || course.certificate || {}),
      enabled: true,
      templateId: template._id,
      minimumCompletionPercentage: 80,
      autoIssue: false,
    };
    await course.save();
  }

  console.log({
    templateId: template._id.toString(),
    templateCode: template.templateCode,
    courseUpdated: Boolean(course),
    note: 'Issue certificates via admin API after enrollment seed completes a student',
  });
  await disconnectDatabase();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
