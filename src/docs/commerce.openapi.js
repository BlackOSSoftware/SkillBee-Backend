const bearer = [{ bearerAuth: [] }];

export const commerceOpenApiTags = [
  { name: 'Student Cart' },
  { name: 'Student Checkout' },
  { name: 'Student Orders' },
  { name: 'Payments' },
  { name: 'Coupons' },
  { name: 'Admin Coupons' },
  { name: 'Admin Orders' },
  { name: 'Admin Payments' },
  { name: 'Admin Refunds' },
  { name: 'Admin Payment Gateways' },
  { name: 'Webhooks' },
];

export const commerceOpenApiPaths = {
  '/admin/coupons': {
    get: {
      tags: ['Admin Coupons'],
      summary: 'List coupons (search, filters, pagination)',
      security: bearer,
      responses: { 200: { description: 'Coupons' } },
    },
    post: {
      tags: ['Admin Coupons'],
      summary: 'Create coupon',
      security: bearer,
      responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate code' } },
    },
  },
  '/admin/coupons/{id}': {
    get: {
      tags: ['Admin Coupons'],
      summary: 'Coupon details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Coupon' } },
    },
    patch: {
      tags: ['Admin Coupons'],
      summary: 'Update coupon (immutable discount fields after use)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' } },
    },
    delete: {
      tags: ['Admin Coupons'],
      summary: 'Soft-deactivate coupon',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deactivated' } },
    },
  },
  '/admin/coupons/{id}/usage': {
    get: {
      tags: ['Admin Coupons'],
      summary: 'Coupon usage history',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Usages' } },
    },
  },
  '/coupons/validate': {
    post: {
      tags: ['Coupons'],
      summary: 'Validate coupon against live MongoDB course prices',
      security: bearer,
      responses: {
        200: { description: 'Discount preview' },
        400: { description: 'Invalid / expired / ineligible coupon' },
      },
    },
  },
  '/student/cart': {
    get: {
      tags: ['Student Cart'],
      summary: 'Get student cart with live MongoDB prices',
      security: bearer,
      responses: { 200: { description: 'Cart' } },
    },
    delete: {
      tags: ['Student Cart'],
      summary: 'Clear cart',
      security: bearer,
      responses: { 200: { description: 'Cleared' } },
    },
  },
  '/student/cart/items': {
    post: {
      tags: ['Student Cart'],
      summary: 'Add course to cart',
      security: bearer,
      responses: { 201: { description: 'Added' }, 409: { description: 'Duplicate or already enrolled' } },
    },
  },
  '/student/cart/items/{courseId}': {
    delete: {
      tags: ['Student Cart'],
      summary: 'Remove course from cart',
      security: bearer,
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Removed' } },
    },
  },
  '/student/checkout': {
    post: {
      tags: ['Student Checkout'],
      summary: 'Create pending order (or complete free enrollment). Prices from DB only.',
      security: bearer,
      responses: {
        201: { description: 'Order created' },
        400: { description: 'Invalid course / pricing / coupon' },
      },
    },
  },
  '/student/orders': {
    get: {
      tags: ['Student Orders'],
      summary: 'Own order history',
      security: bearer,
      responses: { 200: { description: 'Orders' } },
    },
  },
  '/student/orders/{id}': {
    get: {
      tags: ['Student Orders'],
      summary: 'Own order details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Order' }, 404: { description: 'Not found' } },
    },
  },
  '/student/orders/{id}/invoice': {
    get: {
      tags: ['Student Orders'],
      summary: 'Download invoice PDF (own orders only)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'PDF' } },
    },
  },
  '/payments/available/{orderId}': {
    get: {
      tags: ['Payments'],
      summary: 'List gateways available for order billing country',
      security: bearer,
      parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Available gateways' } },
    },
  },
  '/payments/razorpay/create-order': {
    post: {
      tags: ['Payments'],
      summary: 'Create Razorpay order for a pending SkillBee order',
      security: bearer,
      responses: { 200: { description: 'Public checkout payload (keyId, razorpayOrderId, amount)' } },
    },
  },
  '/payments/razorpay/verify': {
    post: {
      tags: ['Payments'],
      summary: 'Verify Razorpay checkout signature (not sole proof — webhooks reconcile)',
      security: bearer,
      responses: { 200: { description: 'Verified / fulfilled' }, 400: { description: 'Invalid signature' } },
    },
  },
  '/payments/paypal/create-order': {
    post: {
      tags: ['Payments'],
      summary: 'Create PayPal order for international checkout',
      security: bearer,
      responses: { 200: { description: 'approveUrl + paypalOrderId' } },
    },
  },
  '/payments/paypal/capture-order': {
    post: {
      tags: ['Payments'],
      summary: 'Capture PayPal order server-side',
      security: bearer,
      responses: { 200: { description: 'Captured / fulfilled' } },
    },
  },
  '/webhooks/razorpay': {
    post: {
      tags: ['Webhooks'],
      summary: 'Razorpay webhook (raw body + X-Razorpay-Signature)',
      responses: { 200: { description: 'Processed or duplicate' }, 400: { description: 'Invalid signature' } },
    },
  },
  '/webhooks/paypal': {
    post: {
      tags: ['Webhooks'],
      summary: 'PayPal webhook (verified via PayPal API + PAYPAL_WEBHOOK_ID)',
      responses: { 200: { description: 'Processed or duplicate' }, 400: { description: 'Invalid signature' } },
    },
  },
  '/admin/orders': {
    get: {
      tags: ['Admin Orders'],
      summary: 'List orders (search, filters, pagination)',
      security: bearer,
      responses: { 200: { description: 'Orders' } },
    },
  },
  '/admin/orders/{id}': {
    get: {
      tags: ['Admin Orders'],
      summary: 'Order details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Order' } },
    },
  },
  '/admin/orders/{id}/status': {
    patch: {
      tags: ['Admin Orders'],
      summary: 'Update order status (cannot mark unpaid as completed)',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' }, 400: { description: 'Invalid transition' } },
    },
  },
  '/admin/orders/{id}/history': {
    get: {
      tags: ['Admin Orders'],
      summary: 'Order audit history',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'History' } },
    },
  },
  '/admin/orders/{id}/invoice': {
    get: {
      tags: ['Admin Orders'],
      summary: 'Download invoice PDF',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'PDF' } },
    },
  },
  '/admin/orders/{id}/refunds': {
    post: {
      tags: ['Admin Refunds'],
      summary: 'Initiate full or partial Razorpay refund',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 201: { description: 'Refund created' } },
    },
  },
  '/admin/courses/{courseId}/orders': {
    get: {
      tags: ['Admin Orders'],
      summary: 'Orders containing a course',
      security: bearer,
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Orders' } },
    },
  },
  '/admin/students/{studentId}/orders': {
    get: {
      tags: ['Admin Orders'],
      summary: 'Orders for a student',
      security: bearer,
      parameters: [{ name: 'studentId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Orders' } },
    },
  },
  '/admin/payments': {
    get: {
      tags: ['Admin Payments'],
      summary: 'List payment records',
      security: bearer,
      responses: { 200: { description: 'Payments' } },
    },
  },
  '/admin/payments/{id}': {
    get: {
      tags: ['Admin Payments'],
      summary: 'Payment details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Payment' } },
    },
  },
  '/admin/refunds': {
    get: {
      tags: ['Admin Refunds'],
      summary: 'Refund history',
      security: bearer,
      responses: { 200: { description: 'Refunds' } },
    },
  },
  '/admin/refunds/{id}': {
    get: {
      tags: ['Admin Refunds'],
      summary: 'Refund details',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Refund' } },
    },
  },
  '/admin/payment-gateways': {
    get: {
      tags: ['Admin Payment Gateways'],
      summary: 'Gateway configs (secrets masked)',
      security: bearer,
      responses: { 200: { description: 'Gateways' } },
    },
  },
  '/admin/payment-gateways/razorpay': {
    patch: {
      tags: ['Admin Payment Gateways'],
      summary: 'Update Razorpay config (encrypt secrets at rest)',
      security: bearer,
      responses: { 200: { description: 'Updated (masked)' } },
    },
  },
  '/admin/payment-gateways/paypal': {
    patch: {
      tags: ['Admin Payment Gateways'],
      summary: 'Update PayPal config (encrypt secrets at rest)',
      security: bearer,
      responses: { 200: { description: 'Updated (masked)' } },
    },
  },
  '/admin/payment-gateways/razorpay/test': {
    post: {
      tags: ['Admin Payment Gateways'],
      summary: 'Smoke-test Razorpay credentials',
      security: bearer,
      responses: { 200: { description: 'Result' } },
    },
  },
  '/admin/payment-gateways/paypal/test': {
    post: {
      tags: ['Admin Payment Gateways'],
      summary: 'Smoke-test PayPal credentials',
      security: bearer,
      responses: { 200: { description: 'Result' } },
    },
  },
  '/admin/payment-gateways/razorpay/status': {
    get: {
      tags: ['Admin Payment Gateways'],
      summary: 'Razorpay health / readiness',
      security: bearer,
      responses: { 200: { description: 'Status' } },
    },
  },
  '/admin/payment-gateways/paypal/status': {
    get: {
      tags: ['Admin Payment Gateways'],
      summary: 'PayPal health / readiness',
      security: bearer,
      responses: { 200: { description: 'Status' } },
    },
  },
};
