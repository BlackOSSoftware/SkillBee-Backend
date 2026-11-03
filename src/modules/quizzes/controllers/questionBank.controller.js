import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as bankService from '../services/questionBank.service.js';

export const list = asyncHandler(async (req, res) => {
  const result = await bankService.listBank(req, req.query);
  res.json({
    success: true,
    data: { questions: result.questions },
    pagination: result.pagination,
  });
});

export const create = asyncHandler(async (req, res) => {
  const question = await bankService.createBankQuestion(req, req.body);
  res.status(201).json({ success: true, data: { question } });
});

export const getOne = asyncHandler(async (req, res) => {
  const question = await bankService.getBankQuestion(req, req.params.id);
  res.json({ success: true, data: { question } });
});

export const update = asyncHandler(async (req, res) => {
  const question = await bankService.updateBankQuestion(req, req.params.id, req.body);
  res.json({ success: true, data: { question } });
});

export const remove = asyncHandler(async (req, res) => {
  const question = await bankService.deleteBankQuestion(req, req.params.id);
  res.json({ success: true, data: { question, message: 'Question bank item archived' } });
});

export const categories = asyncHandler(async (_req, res) => {
  const categoriesList = await bankService.listCategories();
  res.json({ success: true, data: { categories: categoriesList } });
});
