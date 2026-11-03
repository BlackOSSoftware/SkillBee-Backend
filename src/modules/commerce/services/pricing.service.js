import { COURSE_STATUS } from '../../../config/security.js';
import { Course } from '../../../models/Course.js';
import { CourseEnrollment } from '../../../models/CourseEnrollment.js';
import { AppError } from '../../../utils/AppError.js';
import { percentOfMinor, toMinorUnits } from '../../../utils/money.js';

/**
 * Resolve authoritative payable major price from DB course document.
 */
export function resolveCoursePriceMajor(course, now = new Date()) {
  const pricing = course.pricing || {};
  if (pricing.type === 'free') return 0;

  let price = Number(pricing.regularPrice) || 0;
  const sale = pricing.salePrice;
  if (sale != null && sale >= 0) {
    const startOk = !pricing.saleStartAt || new Date(pricing.saleStartAt) <= now;
    const endOk = !pricing.saleEndAt || new Date(pricing.saleEndAt) >= now;
    if (startOk && endOk) price = Number(sale);
  }
  if (price < 0) throw new AppError('Invalid course price', 500, 'INVALID_PRICE');
  return price;
}

export function assertCoursePurchasable(course, now = new Date()) {
  if (!course || course.deletedAt) {
    throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  }
  if (course.status !== COURSE_STATUS.PUBLISHED) {
    throw new AppError('Course is not available for purchase', 400, 'COURSE_NOT_PUBLISHED');
  }
  const pricing = course.pricing || {};
  if (pricing.isPurchasable === false) {
    throw new AppError('Course is not purchasable', 400, 'COURSE_NOT_PURCHASABLE');
  }
  const avail = pricing.purchaseAvailability || {};
  if (avail.enabled === false) {
    throw new AppError('Course purchase is disabled', 400, 'PURCHASE_DISABLED');
  }
  if (avail.startAt && new Date(avail.startAt) > now) {
    throw new AppError('Course purchase has not started', 400, 'PURCHASE_NOT_STARTED');
  }
  if (avail.endAt && new Date(avail.endAt) < now) {
    throw new AppError('Course purchase window has ended', 400, 'PURCHASE_ENDED');
  }
}

export async function loadPurchasableCourses(courseIds) {
  const unique = [...new Set(courseIds.map(String))];
  const courses = await Course.find({
    _id: { $in: unique },
    deletedAt: null,
  });
  if (courses.length !== unique.length) {
    throw new AppError('One or more courses not found', 404, 'COURSE_NOT_FOUND');
  }
  return courses;
}

export async function assertNotAlreadyEnrolled(studentId, courseId) {
  const existing = await CourseEnrollment.findOne({
    courseId,
    studentId,
    deletedAt: null,
    status: { $in: ['active', 'completed', 'pending'] },
  });
  if (existing) {
    throw new AppError(
      'Student already enrolled in this course',
      409,
      'ALREADY_ENROLLED'
    );
  }
}

export function buildOrderItemSnapshot(course, now = new Date()) {
  assertCoursePurchasable(course, now);
  const pricing = course.pricing || {};
  const finalMajor = resolveCoursePriceMajor(course, now);
  const currency = pricing.currency || 'INR';
  const finalPaise = toMinorUnits(finalMajor, currency);
  let taxPaise = 0;
  if (pricing.taxConfiguration?.taxEnabled && !pricing.taxConfiguration?.taxInclusive) {
    taxPaise = percentOfMinor(finalPaise, pricing.taxConfiguration.taxPercent || 0);
  }
  return {
    courseId: course._id,
    courseNameSnapshot: course.title,
    courseSlugSnapshot: course.slug,
    courseThumbnailSnapshot: course.thumbnail || null,
    regularPriceSnapshot: Number(pricing.regularPrice) || 0,
    salePriceSnapshot: pricing.salePrice ?? null,
    finalPriceMajor: finalMajor,
    finalPricePaise: finalPaise,
    currency,
    discountPaise: 0,
    taxPaise,
    itemTotalPaise: finalPaise + taxPaise,
  };
}
