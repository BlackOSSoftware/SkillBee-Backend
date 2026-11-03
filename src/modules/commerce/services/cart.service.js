import { Cart } from '../../../models/Cart.js';
import { AppError } from '../../../utils/AppError.js';
import {
  assertNotAlreadyEnrolled,
  buildOrderItemSnapshot,
  loadPurchasableCourses,
} from './pricing.service.js';

async function getOrCreateCart(studentId) {
  let cart = await Cart.findOne({ studentId });
  if (!cart) {
    cart = await Cart.create({ studentId, items: [] });
  }
  return cart;
}

export async function getCart(req) {
  const cart = await getOrCreateCart(req.user._id);
  const courseIds = cart.items.map((i) => i.courseId);
  let priced = [];
  if (courseIds.length) {
    const courses = await loadPurchasableCourses(courseIds).catch(() => []);
    // Soft: drop unavailable silently from display pricing
    const byId = new Map(courses.map((c) => [c._id.toString(), c]));
    priced = cart.items
      .map((item) => {
        const course = byId.get(item.courseId.toString());
        if (!course) return null;
        try {
          const snap = buildOrderItemSnapshot(course);
          return {
            courseId: course._id.toString(),
            title: course.title,
            slug: course.slug,
            thumbnail: course.thumbnail,
            addedAt: item.addedAt,
            finalPrice: snap.finalPriceMajor,
            finalPricePaise: snap.finalPricePaise,
            currency: snap.currency,
            pricingType: course.pricing?.type,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  return {
    studentId: req.user._id.toString(),
    items: priced,
    itemCount: priced.length,
  };
}

export async function addToCart(req, courseId) {
  await assertNotAlreadyEnrolled(req.user._id, courseId);
  const [course] = await loadPurchasableCourses([courseId]);
  buildOrderItemSnapshot(course); // validates purchasable

  const cart = await getOrCreateCart(req.user._id);
  if (cart.items.some((i) => i.courseId.toString() === String(courseId))) {
    throw new AppError('Course already in cart', 409, 'DUPLICATE_CART_ITEM');
  }
  cart.items.push({ courseId, addedAt: new Date() });
  await cart.save();
  return getCart(req);
}

export async function removeFromCart(req, courseId) {
  const cart = await getOrCreateCart(req.user._id);
  cart.items = cart.items.filter((i) => i.courseId.toString() !== String(courseId));
  await cart.save();
  return getCart(req);
}

export async function clearCart(req) {
  const cart = await getOrCreateCart(req.user._id);
  cart.items = [];
  await cart.save();
  return getCart(req);
}

export async function getCartCourseIds(studentId) {
  const cart = await Cart.findOne({ studentId }).lean();
  return (cart?.items || []).map((i) => i.courseId.toString());
}

export async function clearCartForStudent(studentId) {
  await Cart.updateOne({ studentId }, { $set: { items: [] } });
}
