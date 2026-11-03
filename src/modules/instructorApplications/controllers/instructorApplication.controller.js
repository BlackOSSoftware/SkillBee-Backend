import fs from 'fs';
import * as service from '../services/instructorApplication.service.js';
import { resolveResumeAbsolutePath } from '../services/resumeStorage.service.js';

export async function submit(req, res, next) {
  try {
    const data = await service.submitApplication(req.body, req.file);
    res.status(201).json({
      success: true,
      data: {
        message: 'Application submitted successfully',
        ...data,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const result = await service.listApplications(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const doc = await service.getApplication(req.params.id);
    res.json({ success: true, data: doc.toAdminObject() });
  } catch (err) {
    next(err);
  }
}

export async function patchStatus(req, res, next) {
  try {
    const data = await service.updateStatus(req, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const data = await service.deleteApplication(req, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function downloadResume(req, res, next) {
  try {
    const doc = await service.getApplication(req.params.id);
    const abs = resolveResumeAbsolutePath(doc.resume.storagePath);
    if (!fs.existsSync(abs)) {
      res.status(404).json({
        success: false,
        error: { code: 'RESUME_FILE_MISSING', message: 'Resume file not found' },
      });
      return;
    }
    res.setHeader('Content-Type', doc.resume.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.resume.originalFileName || 'resume')}"`
    );
    fs.createReadStream(abs).pipe(res);
  } catch (err) {
    next(err);
  }
}
