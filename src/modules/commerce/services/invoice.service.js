import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import PDFDocument from 'pdfkit';
import { getTempRoot, getUploadRoot, resolveInsideRoot } from '../../media/utils/storagePath.js';
import { fromMinorUnits } from '../../../utils/money.js';
import { AppError } from '../../../utils/AppError.js';

export async function generateInvoicePdf(order) {
  const tempRoot = getTempRoot();
  await fsp.mkdir(tempRoot, { recursive: true });
  const tempFile = path.join(tempRoot, `inv-${order.orderNumber}-${Date.now()}.pdf`);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(tempFile);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);

    doc.fontSize(18).text('Tax Invoice / Receipt', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(`Invoice: ${order.invoiceNumber || 'PENDING'}`);
    doc.text(`Order: ${order.orderNumber}`);
    doc.text(`Date: ${new Date(order.completedAt || order.createdAt).toISOString().slice(0, 10)}`);
    doc.text(`Payment status: ${order.paymentStatus}`);
    if (order.gatewayPaymentId) doc.text(`Gateway payment: ${order.gatewayPaymentId}`);
    doc.moveDown();
    doc.text(`Bill to: ${order.billing?.fullName || ''}`);
    doc.text(`Email: ${order.billing?.email || ''}`);
    if (order.billing?.gstin) doc.text(`GSTIN: ${order.billing.gstin}`);
    doc.moveDown();
    doc.text('Items:');
    for (const item of order.items) {
      doc.text(
        `- ${item.courseNameSnapshot}: ${fromMinorUnits(item.itemTotalPaise, order.currency)} ${order.currency}`
      );
    }
    doc.moveDown();
    doc.text(`Subtotal: ${fromMinorUnits(order.subtotalPaise, order.currency)} ${order.currency}`);
    doc.text(`Discount: ${fromMinorUnits(order.discountPaise, order.currency)} ${order.currency}`);
    doc.text(`Tax: ${fromMinorUnits(order.taxPaise, order.currency)} ${order.currency}`);
    doc.fontSize(13).text(
      `Total: ${fromMinorUnits(order.totalPaise, order.currency)} ${order.currency}`
    );
    doc.end();
  });

  const fileName = `${(order.invoiceNumber || order.orderNumber).replace(/[^A-Z0-9-]/gi, '_')}.pdf`;
  const storageKey = path.posix.join('invoices', new Date().toISOString().slice(0, 10), fileName);
  const absolute = resolveInsideRoot(getUploadRoot(), storageKey);
  await fsp.mkdir(path.dirname(absolute), { recursive: true });
  await fsp.copyFile(tempFile, absolute);
  await fsp.unlink(tempFile).catch(() => {});
  return { storageKey, fileName, absolute };
}

export async function readInvoiceBuffer(order) {
  if (!order.invoiceStorageKey) {
    throw new AppError('Invoice not available', 404, 'INVOICE_NOT_FOUND');
  }
  const absolute = resolveInsideRoot(getUploadRoot(), order.invoiceStorageKey);
  if (!fs.existsSync(absolute)) {
    throw new AppError('Invoice file missing', 404, 'INVOICE_NOT_FOUND');
  }
  return fsp.readFile(absolute);
}
