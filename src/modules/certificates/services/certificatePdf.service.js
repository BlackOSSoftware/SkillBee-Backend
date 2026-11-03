import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '../../../config/env.js';
import { getTempRoot, getUploadRoot, resolveInsideRoot } from '../../media/utils/storagePath.js';
import { AppError } from '../../../utils/AppError.js';

function truncate(text, max) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function buildVerificationUrl(verificationCode) {
  const base =
    (env.PUBLIC_API_BASE_URL || '').replace(/\/$/, '') ||
    `http://localhost:${env.PORT}${env.API_PREFIX}`;
  const verifyPath = (env.CERTIFICATE_VERIFY_PATH || '/certificates/verify').replace(/\/$/, '');
  // PUBLIC_API_BASE_URL should include API prefix when set, e.g. https://api.example.com/api/v1
  const root = base.includes(env.API_PREFIX)
    ? base
    : `${base}${env.API_PREFIX}`;
  return `${root}${verifyPath}/${verificationCode}`;
}

export function buildCertificateStorageKey(fileName) {
  const date = new Date().toISOString().slice(0, 10);
  return path.posix.join('certificates', date, fileName);
}

/**
 * Generate certificate PDF with embedded QR. Returns paths + checksum.
 * Temp files cleaned by caller via cleanupTempFiles.
 */
export async function generateCertificatePdf({
  certificateNumber,
  verificationCode,
  verificationUrl,
  studentName,
  courseName,
  completionDate,
  issueDate,
  templateSnapshot,
}) {
  const layout = templateSnapshot?.layoutConfiguration || {};
  const fields = templateSnapshot?.fieldConfiguration || {};
  const orientation = layout.orientation === 'portrait' ? 'portrait' : 'landscape';
  const pageWidth = Number(layout.pageWidth) || (orientation === 'landscape' ? 842 : 595);
  const pageHeight = Number(layout.pageHeight) || (orientation === 'landscape' ? 595 : 842);
  const margin = Number(layout.margin) || 40;

  const tempRoot = getTempRoot();
  await fsp.mkdir(tempRoot, { recursive: true });
  const tempPdf = path.join(
    tempRoot,
    `cert-${certificateNumber.replace(/[^A-Z0-9-]/gi, '_')}-${Date.now()}.pdf`
  );
  const tempQr = path.join(tempRoot, `qr-${verificationCode.slice(0, 16)}-${Date.now()}.png`);

  try {
    await QRCode.toFile(tempQr, verificationUrl, {
      type: 'png',
      width: 180,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: [pageWidth, pageHeight],
        margin,
        info: {
          Title: templateSnapshot?.certificateTitle || 'Certificate',
          Author: templateSnapshot?.organizationName || 'SkillBee',
          Subject: `Certificate ${certificateNumber}`,
        },
      });
      const stream = fs.createWriteStream(tempPdf);
      doc.pipe(stream);
      stream.on('finish', resolve);
      stream.on('error', reject);
      doc.on('error', reject);

      // Optional background — only if local storageKey resolves
      tryEmbedImage(doc, templateSnapshot?.backgroundImage, 0, 0, pageWidth, pageHeight);

      doc
        .fontSize(10)
        .fillColor('#555555')
        .text(truncate(templateSnapshot?.organizationName || 'SkillBee', 80), margin, margin, {
          width: pageWidth - margin * 2,
          align: 'center',
        });

      doc
        .moveDown(1.5)
        .fontSize(28)
        .fillColor('#111111')
        .text(truncate(templateSnapshot?.certificateTitle || 'Certificate of Completion', 80), {
          align: 'center',
        });

      doc
        .moveDown(0.8)
        .fontSize(12)
        .fillColor('#333333')
        .text(
          truncate(
            templateSnapshot?.certificateDescription ||
              'This certifies that the learner has successfully completed the course.',
            280
          ),
          { align: 'center' }
        );

      if (fields.showStudentName !== false) {
        doc
          .moveDown(1.2)
          .fontSize(11)
          .fillColor('#666666')
          .text('Awarded to', { align: 'center' });
        doc
          .moveDown(0.3)
          .fontSize(22)
          .fillColor('#000000')
          .text(truncate(studentName, 80), { align: 'center' });
      }

      if (fields.showCourseName !== false) {
        doc
          .moveDown(0.8)
          .fontSize(11)
          .fillColor('#666666')
          .text('for successfully completing', { align: 'center' });
        doc
          .moveDown(0.3)
          .fontSize(16)
          .fillColor('#111111')
          .text(truncate(courseName, 100), { align: 'center' });
      }

      const metaY = pageHeight - margin - 140;
      doc.fontSize(10).fillColor('#333333');
      let metaLine = margin + 10;
      if (fields.showCertificateNumber !== false) {
        doc.text(`Certificate No: ${certificateNumber}`, margin, metaY, { width: 320 });
        metaLine = metaY + 16;
      }
      if (fields.showCompletionDate !== false) {
        doc.text(`Completion: ${formatDate(completionDate)}`, margin, metaLine);
        metaLine += 14;
      }
      if (fields.showIssueDate !== false) {
        doc.text(`Issued: ${formatDate(issueDate)}`, margin, metaLine);
        metaLine += 14;
      }
      if (fields.showVerificationUrl !== false) {
        doc
          .fontSize(8)
          .fillColor('#555555')
          .text(`Verify: ${verificationUrl}`, margin, metaLine, {
            width: pageWidth - margin * 2 - 160,
          });
      }

      if (fields.showSignatory !== false && templateSnapshot?.authorizedSignatoryName) {
        const sigX = pageWidth - margin - 220;
        tryEmbedImage(doc, templateSnapshot?.signatureImage, sigX, metaY - 40, 120, 40);
        doc
          .fontSize(11)
          .fillColor('#111111')
          .text(truncate(templateSnapshot.authorizedSignatoryName, 40), sigX, metaY + 10, {
            width: 200,
          });
        if (templateSnapshot.authorizedSignatoryDesignation) {
          doc
            .fontSize(9)
            .fillColor('#555555')
            .text(truncate(templateSnapshot.authorizedSignatoryDesignation, 50), sigX, metaY + 26, {
              width: 200,
            });
        }
      }

      if (fields.showQrCode !== false) {
        const qrSize = 90;
        const qrX = pageWidth - margin - qrSize;
        const qrY = pageHeight - margin - qrSize - 10;
        if (fs.existsSync(tempQr)) {
          doc.image(tempQr, qrX, qrY, { width: qrSize, height: qrSize });
        }
      }

      doc.end();
    });

    const buffer = await fsp.readFile(tempPdf);
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const fileName = `${certificateNumber.replace(/[^A-Z0-9-]/gi, '_')}.pdf`;
    const storageKey = buildCertificateStorageKey(fileName);
    const uploadRoot = getUploadRoot();
    const absolute = resolveInsideRoot(uploadRoot, storageKey);
    await fsp.mkdir(path.dirname(absolute), { recursive: true });
    await fsp.copyFile(tempPdf, absolute);

    return {
      pdfStorageKey: storageKey,
      pdfFileName: fileName,
      pdfChecksum: checksum,
      absolutePath: absolute,
      tempFiles: [tempPdf, tempQr],
    };
  } catch (err) {
    await cleanupTempFiles([tempPdf, tempQr]);
    throw new AppError(
      `Certificate PDF generation failed: ${err.message}`,
      500,
      'PDF_GENERATION_FAILED'
    );
  }
}

function formatDate(d) {
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function tryEmbedImage(doc, mediaRef, x, y, w, h) {
  if (!mediaRef?.storageKey) return;
  try {
    const absolute = resolveInsideRoot(getUploadRoot(), mediaRef.storageKey);
    if (fs.existsSync(absolute)) {
      doc.image(absolute, x, y, { width: w, height: h });
    }
  } catch {
    /* skip missing/invalid assets */
  }
}

export async function cleanupTempFiles(files = []) {
  for (const f of files) {
    try {
      if (f) await fsp.unlink(f);
    } catch {
      /* ignore */
    }
  }
}

export async function readCertificatePdfBuffer(pdfStorageKey) {
  const absolute = resolveInsideRoot(getUploadRoot(), pdfStorageKey);
  if (!fs.existsSync(absolute)) {
    throw new AppError('Certificate PDF not found', 404, 'PDF_NOT_FOUND');
  }
  return fsp.readFile(absolute);
}
