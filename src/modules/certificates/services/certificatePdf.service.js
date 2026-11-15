import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '../../../config/env.js';
import { getTempRoot, getUploadRoot, resolveInsideRoot } from '../../media/utils/storagePath.js';
import { MediaAsset } from '../../../models/MediaAsset.js';
import { AppError } from '../../../utils/AppError.js';

const IMAGE_FETCH_TIMEOUT_MS = 10_000;
const IMAGE_FETCH_MAX_BYTES = 8 * 1024 * 1024;

function isCloudinaryDeliveryUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com';
  } catch {
    return false;
  }
}

/** pdfkit embeds only JPEG and PNG, so Cloudinary is asked to deliver PNG. */
function pngDeliveryUrl(secureUrl) {
  return secureUrl.includes('/image/upload/f_png/') ? secureUrl : secureUrl.replace('/image/upload/', '/image/upload/f_png/');
}

async function fetchCloudinaryImage(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS), redirect: 'error' });
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/^image\/(png|jpeg)/.test(type)) throw new Error(`unsupported image type ${type}`);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > IMAGE_FETCH_MAX_BYTES) throw new Error('image too large');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > IMAGE_FETCH_MAX_BYTES) throw new Error('image too large');
  return buffer;
}

/**
 * Resolves a template image to something pdfkit can draw: a local file under the upload root, or
 * a PNG buffer for a Cloudinary image asset. Only Cloudinary delivery URLs are ever fetched.
 * Returns null when the image is missing or unreadable so the PDF still renders.
 */
export async function resolveTemplateImage(mediaRef) {
  if (!mediaRef) return null;
  if (mediaRef.storageKey) {
    try {
      const absolute = resolveInsideRoot(getUploadRoot(), mediaRef.storageKey);
      if (fs.existsSync(absolute)) return absolute;
    } catch {
      /* fall through to Cloudinary */
    }
  }
  let url = null;
  if (mediaRef.mediaAssetId) {
    const asset = await MediaAsset.findOne({
      _id: mediaRef.mediaAssetId,
      deletedAt: null,
      mediaType: 'image',
      storageProvider: 'cloudinary',
    })
      .select('secureUrl')
      .lean();
    url = asset?.secureUrl || null;
  }
  if (!url && mediaRef.url) url = mediaRef.url;
  if (!url || !isCloudinaryDeliveryUrl(url)) return null;
  try {
    return await fetchCloudinaryImage(pngDeliveryUrl(url));
  } catch (err) {
    console.warn('[certificate] template image skipped:', err.message);
    return null;
  }
}

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

  const [backgroundImage, organizationLogo, signatureImage] = await Promise.all([
    resolveTemplateImage(templateSnapshot?.backgroundImage),
    resolveTemplateImage(templateSnapshot?.organizationLogo),
    resolveTemplateImage(templateSnapshot?.signatureImage),
  ]);

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

      drawImage(doc, backgroundImage, 0, 0, { width: pageWidth, height: pageHeight });

      const logoHeight = 44;
      const logoDrawn = drawImage(doc, organizationLogo, pageWidth / 2 - 60, margin, {
        fit: [120, logoHeight],
        align: 'center',
        valign: 'center',
      });

      doc
        .fontSize(10)
        .fillColor('#555555')
        .text(
          truncate(templateSnapshot?.organizationName || 'SkillBee', 80),
          margin,
          logoDrawn ? margin + logoHeight + 8 : margin,
          { width: pageWidth - margin * 2, align: 'center' }
        );

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
        drawImage(doc, signatureImage, sigX, metaY - 40, { fit: [120, 40], valign: 'bottom' });
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

/** Draws a resolved image (path or buffer); returns whether it was drawn. */
function drawImage(doc, source, x, y, options) {
  if (!source) return false;
  try {
    doc.image(source, x, y, options);
    return true;
  } catch {
    return false;
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
