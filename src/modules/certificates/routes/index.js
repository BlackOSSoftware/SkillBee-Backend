import adminTemplateRoutes from './adminTemplate.routes.js';
import adminCertificateRoutes, {
  adminEligibilityRouter,
} from './adminCertificate.routes.js';
import studentCertificateRoutes from './studentCertificate.routes.js';
import publicVerifyRoutes from './publicVerify.routes.js';

export function mountCertificateRoutes(app, apiPrefix) {
  app.use(`${apiPrefix}/admin/certificate-templates`, adminTemplateRoutes);
  app.use(`${apiPrefix}/admin/certificates`, adminCertificateRoutes);
  app.use(
    `${apiPrefix}/admin/students/:studentId/certificate-eligibility/:courseId`,
    adminEligibilityRouter
  );
  app.use(`${apiPrefix}/student/certificates`, studentCertificateRoutes);
  app.use(`${apiPrefix}/certificates/verify`, publicVerifyRoutes);
}
