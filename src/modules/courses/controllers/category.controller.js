import * as categoryService from '../services/category.service.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export const listCategories = asyncHandler(async (req, res) => {
  const result = await categoryService.listCategories(req.query);
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

export const listPublicCategories = asyncHandler(async (_req, res) => {
  const categories = await categoryService.listPublicCategories();
  res.json({ success: true, data: { categories } });
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.user._id, req.body);
  res.status(201).json({ success: true, data: { category } });
});

export const getCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategoryById(req.params.id);
  res.json({ success: true, data: { category } });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(req.user._id, req.params.id, req.body);
  res.json({ success: true, data: { category } });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.deleteCategory(req.user._id, req.params.id);
  res.json({ success: true, data: { category } });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategoryStatus(
    req.user._id,
    req.params.id,
    req.body.status
  );
  res.json({ success: true, data: { category } });
});

export const reorder = asyncHandler(async (req, res) => {
  const result = await categoryService.reorderCategories(req.user._id, req.body.items);
  res.json({ success: true, data: result });
});

export const listCategoryCourses = asyncHandler(async (req, res) => {
  const result = await categoryService.listCategoryCourses(req.params.id, {
    page: Number(req.query.page) || 1,
    limit: Math.min(Number(req.query.limit) || 20, 100),
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
});
