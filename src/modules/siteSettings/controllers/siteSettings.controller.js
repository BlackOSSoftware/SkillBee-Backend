import * as siteSettingsService from '../services/siteSettings.service.js';

export async function getAdminSettings(req, res, next) {
  try {
    const data = await siteSettingsService.getAdminSiteSettings();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function patchSettings(req, res, next) {
  try {
    const data = await siteSettingsService.updateSiteSettings(req, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getPublicSettings(req, res, next) {
  try {
    const data = await siteSettingsService.getPublicSiteSettings();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
