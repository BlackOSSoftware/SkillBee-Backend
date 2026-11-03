import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as couponService from '../services/coupon.service.js';

export const listCoupons = asyncHandler(async (req, res) => {
  const result = await couponService.listCoupons(req.query);
  res.json({
    success: true,
    data: { coupons: result.coupons },
    pagination: result.pagination,
  });
});

export const createCoupon = asyncHandler(async (req, res) => {
  const coupon = await couponService.createCoupon(req, req.body);
  res.status(201).json({ success: true, data: { coupon } });
});

export const getCoupon = asyncHandler(async (req, res) => {
  const coupon = await couponService.getCoupon(req.params.id);
  res.json({ success: true, data: { coupon } });
});

export const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await couponService.updateCoupon(req, req.params.id, req.body);
  res.json({ success: true, data: { coupon } });
});

export const deleteCoupon = asyncHandler(async (req, res) => {
  const result = await couponService.deactivateCoupon(req, req.params.id);
  res.json({ success: true, data: result });
});

export const couponUsage = asyncHandler(async (req, res) => {
  const result = await couponService.listCouponUsage(req.params.id, req.query);
  res.json({
    success: true,
    data: { usages: result.usages },
    pagination: result.pagination,
  });
});

export const validateCoupon = asyncHandler(async (req, res) => {
  const data = await couponService.validateCouponForStudent(req, req.body);
  res.json({ success: true, data });
});
