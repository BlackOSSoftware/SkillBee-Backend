/**
 * Central fulfillment entry — both Razorpay and PayPal must call this.
 * Delegates to commerce fulfillment (enrollment, invoice, email).
 */
export {
  completePaidOrder,
  fulfillFreeOrder,
  activateEnrollmentsForOrder,
} from '../../modules/commerce/services/fulfillment.service.js';
