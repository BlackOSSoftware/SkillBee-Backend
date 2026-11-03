import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as cartService from '../services/cart.service.js';
import * as checkoutService from '../services/checkout.service.js';
import * as orderService from '../services/order.service.js';
import * as paymentService from '../services/payment.service.js';
import * as gatewayConfigService from '../services/gatewayConfig.service.js';
import * as refundService from '../services/refund.service.js';
import { processRazorpayWebhook } from '../services/webhook.service.js';

export const getCart = asyncHandler(async (req, res) => {
  const cart = await cartService.getCart(req);
  res.json({ success: true, data: { cart } });
});

export const addCartItem = asyncHandler(async (req, res) => {
  const cart = await cartService.addToCart(req, req.body.courseId);
  res.status(201).json({ success: true, data: { cart } });
});

export const removeCartItem = asyncHandler(async (req, res) => {
  const cart = await cartService.removeFromCart(req, req.params.courseId);
  res.json({ success: true, data: { cart } });
});

export const clearCart = asyncHandler(async (req, res) => {
  const cart = await cartService.clearCart(req);
  res.json({ success: true, data: { cart } });
});

export const checkout = asyncHandler(async (req, res) => {
  const result = await checkoutService.checkout(req, req.body);
  res.status(201).json({ success: true, data: result });
});

export const listMyOrders = asyncHandler(async (req, res) => {
  const result = await orderService.listStudentOrders(req);
  res.json({ success: true, data: result });
});

export const getMyOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getStudentOrder(req, req.params.id);
  res.json({ success: true, data: { order } });
});

export const downloadMyInvoice = asyncHandler(async (req, res) => {
  const file = await orderService.downloadStudentInvoice(req, req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.buffer);
});

export const listAdminOrders = asyncHandler(async (req, res) => {
  const result = await orderService.listAdminOrders(req.query);
  res.json({
    success: true,
    data: { orders: result.orders },
    pagination: result.pagination,
  });
});

export const listCourseOrders = asyncHandler(async (req, res) => {
  const result = await orderService.listAdminOrders({
    ...req.query,
    courseId: req.params.courseId,
  });
  res.json({
    success: true,
    data: { orders: result.orders },
    pagination: result.pagination,
  });
});

export const listStudentOrdersAdmin = asyncHandler(async (req, res) => {
  const result = await orderService.listAdminOrders({
    ...req.query,
    studentId: req.params.studentId,
  });
  res.json({
    success: true,
    data: { orders: result.orders },
    pagination: result.pagination,
  });
});

export const getAdminOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getAdminOrder(req.params.id);
  res.json({ success: true, data: { order } });
});

export const patchOrderStatus = asyncHandler(async (req, res) => {
  const order = await orderService.updateOrderStatus(
    req,
    req.params.id,
    req.body.status,
    req.body.reason
  );
  res.json({ success: true, data: { order } });
});

export const orderHistory = asyncHandler(async (req, res) => {
  const result = await orderService.getOrderHistory(req.params.id);
  res.json({ success: true, data: result });
});

export const downloadAdminInvoice = asyncHandler(async (req, res) => {
  const file = await orderService.downloadAdminInvoice(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.buffer);
});

export const listAvailableGateways = asyncHandler(async (req, res) => {
  const data = await paymentService.getAvailableGatewaysForOrder(req, req.params.orderId);
  res.json({ success: true, data });
});

export const createRazorpayOrder = asyncHandler(async (req, res) => {
  const data = await paymentService.createRazorpayPaymentOrder(req, req.body);
  res.status(201).json({ success: true, data });
});

export const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  const data = await paymentService.verifyRazorpayPayment(req, req.body);
  res.json({ success: true, data });
});

export const createPayPalOrder = asyncHandler(async (req, res) => {
  const data = await paymentService.createPayPalPaymentOrder(req, req.body);
  res.status(201).json({ success: true, data });
});

export const capturePayPalOrder = asyncHandler(async (req, res) => {
  const data = await paymentService.capturePayPalPayment(req, req.body);
  res.json({ success: true, data });
});

export const listPayments = asyncHandler(async (req, res) => {
  const result = await paymentService.listPayments(req.query);
  res.json({
    success: true,
    data: { payments: result.payments },
    pagination: result.pagination,
  });
});

export const getPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.getPayment(req.params.id);
  res.json({ success: true, data: { payment } });
});

export const listGateways = asyncHandler(async (_req, res) => {
  const data = await gatewayConfigService.listGateways();
  res.json({ success: true, data });
});

export const updateRazorpayGateway = asyncHandler(async (req, res) => {
  const data = await gatewayConfigService.updateRazorpayConfig(req, req.body);
  res.json({ success: true, data });
});

export const updatePayPalGateway = asyncHandler(async (req, res) => {
  const data = await gatewayConfigService.updatePayPalConfig(req, req.body);
  res.json({ success: true, data });
});

export const testRazorpayGateway = asyncHandler(async (_req, res) => {
  const data = await gatewayConfigService.testRazorpayCredentials();
  res.json({ success: true, data });
});

export const testPayPalGateway = asyncHandler(async (_req, res) => {
  const data = await gatewayConfigService.testPayPalCredentials();
  res.json({ success: true, data });
});

export const razorpayGatewayStatus = asyncHandler(async (_req, res) => {
  const data = await gatewayConfigService.razorpayStatus();
  res.json({ success: true, data });
});

export const paypalGatewayStatus = asyncHandler(async (_req, res) => {
  const data = await gatewayConfigService.paypalStatus();
  res.json({ success: true, data });
});

export const createRefund = asyncHandler(async (req, res) => {
  const refund = await refundService.createRefund(req, req.params.id, req.body || {});
  res.status(201).json({ success: true, data: { refund } });
});

export const listRefunds = asyncHandler(async (req, res) => {
  const result = await refundService.listRefunds(req.query);
  res.json({
    success: true,
    data: { refunds: result.refunds },
    pagination: result.pagination,
  });
});

export const getRefund = asyncHandler(async (req, res) => {
  const refund = await refundService.getRefund(req.params.id);
  res.json({ success: true, data: { refund } });
});

export const razorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const raw = req.rawBody || req.body;
  const result = await processRazorpayWebhook(raw, signature);
  res.json({ success: true, data: result });
});

export const paypalWebhook = asyncHandler(async (req, res) => {
  const { processPayPalWebhook } = await import(
    '../../../services/payments/webhook-paypal.service.js'
  );
  const result = await processPayPalWebhook(req.headers, req.body);
  res.json({ success: true, data: result });
});
