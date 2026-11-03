import * as emailLogService from '../services/emailLog.service.js';
import * as emailTemplateService from '../services/emailTemplate.service.js';

export async function listTemplates(req, res, next) {
  try {
    const data = await emailTemplateService.listTemplates();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createTemplate(req, res, next) {
  try {
    const data = await emailTemplateService.createTemplate(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getTemplate(req, res, next) {
  try {
    const doc = await emailTemplateService.getTemplate(req.params.id);
    res.json({ success: true, data: doc.toSafeObject() });
  } catch (err) {
    next(err);
  }
}

export async function updateTemplate(req, res, next) {
  try {
    const data = await emailTemplateService.updateTemplate(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function setTemplateStatus(req, res, next) {
  try {
    const data = await emailTemplateService.setTemplateStatus(
      req.params.id,
      req.body.isActive
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listLogs(req, res, next) {
  try {
    const result = await emailLogService.listEmailLogs(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getLog(req, res, next) {
  try {
    const data = await emailLogService.getEmailLog(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
