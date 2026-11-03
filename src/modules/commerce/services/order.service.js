import { Order, ORDER_STATUSES } from '../../../models/Order.js';
import { User } from '../../../models/User.js';
import { AppError } from '../../../utils/AppError.js';
import { getOrSetCache } from '../../../services/cache/cache.service.js';
import { CACHE_TTL, adminOrdersKey, studentOrdersKey } from '../../../services/cache/keys.js';
import { invalidateCommerceCaches } from '../../../services/cache/invalidation.service.js';
import { readInvoiceBuffer } from './invoice.service.js';

export async function listAdminOrders(query = {}) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const filter = { deletedAt: null };
  if (query.orderStatus) filter.orderStatus = query.orderStatus;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.studentId) filter.studentId = query.studentId;
  if (query.courseId) filter['items.courseId'] = query.courseId;
  if (query.orderNumber) filter.orderNumber = String(query.orderNumber).toUpperCase();
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({
      deletedAt: null,
      $or: [{ email: rx }, { firstName: rx }, { lastName: rx }],
    })
      .select('_id')
      .limit(100)
      .lean();
    filter.$or = [
      { orderNumber: rx },
      { studentId: { $in: users.map((u) => u._id) } },
    ];
  }

  const load = async () => {
    const [rows, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Order.countDocuments(filter),
    ]);
    return {
      orders: rows.map((o) => o.toSafeObject({ includeAdmin: true })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  };
  if (query.search) return load();
  return getOrSetCache(adminOrdersKey(query), CACHE_TTL.DASHBOARD, load);
}

export async function getAdminOrder(id) {
  const order = await Order.findOne({ _id: id, deletedAt: null });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  return order.toSafeObject({ includeAdmin: true });
}

export async function updateOrderStatus(req, id, status, reason) {
  if (!ORDER_STATUSES.includes(status)) {
    throw new AppError('Invalid order status', 400, 'INVALID_STATUS');
  }
  // Admins cannot mark unpaid orders as completed/paid via status alone
  if (['completed'].includes(status)) {
    throw new AppError(
      'Completed status requires verified payment capture',
      400,
      'STATUS_REQUIRES_PAYMENT'
    );
  }
  const order = await Order.findOne({ _id: id, deletedAt: null });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  const from = order.orderStatus;
  order.orderStatus = status;
  if (status === 'cancelled') order.cancelledAt = new Date();
  order.pushHistory({
    action: 'admin_status_change',
    fromStatus: from,
    toStatus: status,
    actorId: req.user._id,
    source: 'admin',
    reason: reason || null,
  });
  await order.save();
  if (['cancelled', 'failed'].includes(status)) {
    const { releaseCouponUsage } = await import('./coupon.service.js');
    await releaseCouponUsage(order._id, {
      status: status === 'failed' ? 'failed' : 'released',
    });
  }
  await invalidateCommerceCaches({ studentId: order.studentId.toString() });
  return order.toSafeObject({ includeAdmin: true });
}

export async function getOrderHistory(id) {
  const order = await Order.findOne({ _id: id, deletedAt: null }).select('history orderNumber').lean();
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  return {
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
    history: order.history || [],
  };
}

export async function listStudentOrders(req) {
  const studentId = req.user._id.toString();
  return getOrSetCache(studentOrdersKey(studentId), CACHE_TTL.DASHBOARD, async () => {
    const rows = await Order.find({ studentId: req.user._id, deletedAt: null }).sort({
      createdAt: -1,
    });
    return { orders: rows.map((o) => o.toSafeObject()) };
  });
}

export async function getStudentOrder(req, id) {
  const order = await Order.findOne({
    _id: id,
    studentId: req.user._id,
    deletedAt: null,
  });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  return order.toSafeObject();
}

export async function downloadStudentInvoice(req, id) {
  const order = await Order.findOne({
    _id: id,
    studentId: req.user._id,
    deletedAt: null,
  });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  const buffer = await readInvoiceBuffer(order);
  return { buffer, fileName: order.invoiceFileName || `${order.orderNumber}.pdf` };
}

export async function downloadAdminInvoice(id) {
  const order = await Order.findOne({ _id: id, deletedAt: null });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  const buffer = await readInvoiceBuffer(order);
  return { buffer, fileName: order.invoiceFileName || `${order.orderNumber}.pdf` };
}
