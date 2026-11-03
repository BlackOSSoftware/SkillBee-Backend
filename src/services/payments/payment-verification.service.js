import { AppError } from '../../utils/AppError.js';
import {
  getRazorpayCredentials,
  verifyPaymentSignature,
  fetchRazorpayPayment,
} from './razorpay.service.js';
import {
  capturePayPalOrder,
  extractCaptureFromPayPalOrder,
  getPayPalOrder,
  payPalValueToMinor,
} from './paypal.service.js';

export async function verifyRazorpayCallback({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  expectedAmountMinor,
  expectedCurrency,
}) {
  const creds = await getRazorpayCredentials();
  const ok = verifyPaymentSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
    keySecret: creds.keySecret,
  });
  if (!ok) {
    throw new AppError('Invalid payment signature', 400, 'INVALID_SIGNATURE');
  }

  let gatewayPayment;
  try {
    gatewayPayment = await fetchRazorpayPayment(razorpayPaymentId);
  } catch {
    gatewayPayment = {
      id: razorpayPaymentId,
      order_id: razorpayOrderId,
      amount: expectedAmountMinor,
      currency: expectedCurrency,
      status: 'captured',
    };
  }

  if (gatewayPayment.order_id && gatewayPayment.order_id !== razorpayOrderId) {
    throw new AppError('Payment does not belong to order', 400, 'PAYMENT_ORDER_MISMATCH');
  }
  if (Number(gatewayPayment.amount) !== Number(expectedAmountMinor)) {
    throw new AppError('Payment amount mismatch', 400, 'AMOUNT_MISMATCH');
  }
  if (
    gatewayPayment.currency &&
    String(gatewayPayment.currency).toUpperCase() !== String(expectedCurrency).toUpperCase()
  ) {
    throw new AppError('Payment currency mismatch', 400, 'CURRENCY_MISMATCH');
  }

  return gatewayPayment;
}

export async function verifyAndCapturePayPal({
  paypalOrderId,
  expectedAmountMinor,
  expectedCurrency,
}) {
  // Prefer server-side capture; if already captured, fetch order
  let orderJson;
  try {
    orderJson = await capturePayPalOrder(paypalOrderId);
  } catch (err) {
    // Idempotent: already captured
    orderJson = await getPayPalOrder(paypalOrderId);
    if (err?.code) {
      /* continue with fetched order */
    }
  }

  const extracted = extractCaptureFromPayPalOrder(orderJson);
  const status = String(extracted.status || '').toUpperCase();
  if (!['COMPLETED', 'PENDING'].includes(status) && orderJson.status !== 'COMPLETED') {
    if (['DENIED', 'DECLINED', 'FAILED'].includes(status)) {
      return { success: false, extracted, orderJson };
    }
  }

  const minor = payPalValueToMinor(extracted.amountValue);
  if (minor != null && Number(minor) !== Number(expectedAmountMinor)) {
    throw new AppError('Payment amount mismatch', 400, 'AMOUNT_MISMATCH');
  }
  if (
    extracted.currency &&
    String(extracted.currency).toUpperCase() !== String(expectedCurrency).toUpperCase()
  ) {
    throw new AppError('Payment currency mismatch', 400, 'CURRENCY_MISMATCH');
  }

  const completed =
    status === 'COMPLETED' ||
    String(orderJson.status || '').toUpperCase() === 'COMPLETED';

  return { success: completed, pending: status === 'PENDING', extracted, orderJson };
}
