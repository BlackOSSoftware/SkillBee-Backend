import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as certificateService from '../services/certificate.service.js';
import * as eligibilityService from '../services/certificateEligibility.service.js';

export const listAdmin = asyncHandler(async (req, res) => {
  const result = await certificateService.listAdminCertificates(req.query);
  res.json({
    success: true,
    data: { certificates: result.certificates },
    pagination: result.pagination,
  });
});

export const getAdmin = asyncHandler(async (req, res) => {
  const certificate = await certificateService.getAdminCertificate(req.params.id);
  res.json({ success: true, data: { certificate } });
});

export const issue = asyncHandler(async (req, res) => {
  const certificate = await certificateService.issueCertificate(req, {
    ...req.body,
    issueSource: 'manual',
  });
  res.status(201).json({ success: true, data: { certificate } });
});

export const revoke = asyncHandler(async (req, res) => {
  const certificate = await certificateService.revokeCertificate(
    req,
    req.params.id,
    req.body?.reason
  );
  res.json({ success: true, data: { certificate } });
});

export const regenerate = asyncHandler(async (req, res) => {
  const certificate = await certificateService.regenerateCertificatePdf(req, req.params.id);
  res.json({ success: true, data: { certificate } });
});

export const history = asyncHandler(async (req, res) => {
  const result = await certificateService.getCertificateHistory(req.params.id);
  res.json({ success: true, data: result });
});

export const downloadAdmin = asyncHandler(async (req, res) => {
  const file = await certificateService.getAdminDownload(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.fileName.replace(/"/g, '')}"`
  );
  res.setHeader('X-Content-SHA256', file.checksum);
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.buffer);
});

export const eligibility = asyncHandler(async (req, res) => {
  const details = await eligibilityService.getEligibilityDetails(
    req.params.studentId,
    req.params.courseId
  );
  res.json({ success: true, data: { eligibility: details } });
});

export const listStudent = asyncHandler(async (req, res) => {
  const result = await certificateService.listStudentCertificates(req);
  res.json({ success: true, data: result });
});

export const getStudent = asyncHandler(async (req, res) => {
  const certificate = await certificateService.getStudentCertificate(req, req.params.id);
  res.json({ success: true, data: { certificate } });
});

export const downloadStudent = asyncHandler(async (req, res) => {
  const file = await certificateService.getStudentDownload(req, req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.fileName.replace(/"/g, '')}"`
  );
  res.setHeader('X-Content-SHA256', file.checksum);
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.buffer);
});

export const verify = asyncHandler(async (req, res) => {
  const result = await certificateService.verifyByCode(req.params.code);
  res.setHeader('Cache-Control', 'no-store');
  const status = result.verificationStatus === 'not_found' ? 404 : 200;
  res.status(status).json({ success: true, data: { verification: result } });
});
