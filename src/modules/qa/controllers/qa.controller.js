import * as qaService from '../services/qa.service.js';

export async function createStudentQuestion(req, res, next) {
  try {
    const data = await qaService.createStudentQuestion(req, req.params.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createStudentReply(req, res, next) {
  try {
    const data = await qaService.createStudentReply(req, req.params.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listStudentQuestions(req, res, next) {
  try {
    const result = await qaService.listStudentQuestions(req, req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getStudentQuestion(req, res, next) {
  try {
    const data = await qaService.getStudentQuestion(req, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listAdminQuestions(req, res, next) {
  try {
    const result = await qaService.listAdminQuestions(req, req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getAdminQuestion(req, res, next) {
  try {
    const data = await qaService.getAdminQuestion(req, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createAdminReply(req, res, next) {
  try {
    const data = await qaService.createAdminReply(req, req.params.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateQuestionStatus(req, res, next) {
  try {
    const data = await qaService.updateQuestionStatus(req, req.params.id, req.body.status);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteQuestion(req, res, next) {
  try {
    const data = await qaService.deleteQuestion(req, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
