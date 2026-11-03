import sanitizeHtml from 'sanitize-html';
import { SiteSettings } from '../../../models/SiteSettings.js';
import { deleteCache, getOrSetCache } from '../../../services/cache/cache.service.js';

const CACHE_KEY = 'site:settings:public';

function clean(text, max) {
  return sanitizeHtml(String(text ?? ''), { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, max);
}

export async function getOrCreateSiteSettings() {
  let doc = await SiteSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await SiteSettings.create({
      key: 'default',
      contact: { companyName: 'SkillBee' },
      socialLinks: {},
    });
  }
  return doc;
}

export async function getAdminSiteSettings() {
  const doc = await getOrCreateSiteSettings();
  return doc.toAdminObject();
}

export async function getPublicSiteSettings() {
  return getOrSetCache(CACHE_KEY, 300, async () => {
    const doc = await getOrCreateSiteSettings();
    return doc.toPublicObject();
  });
}

export async function updateSiteSettings(req, input) {
  const doc = await getOrCreateSiteSettings();

  if (input.contact) {
    const current = doc.contact?.toObject?.() || doc.contact || {};
    const next = { ...current };
    for (const [k, v] of Object.entries(input.contact)) {
      if (v === undefined) continue;
      if (k === 'gstin') next[k] = clean(String(v).toUpperCase(), 15);
      else if (k === 'email') next[k] = clean(String(v).toLowerCase(), 254);
      else next[k] = clean(v, 500);
    }
    doc.contact = next;
  }

  if (input.socialLinks) {
    const current = doc.socialLinks?.toObject?.() || doc.socialLinks || {};
    const next = { ...current };
    for (const [k, v] of Object.entries(input.socialLinks)) {
      if (v === undefined) continue;
      next[k] = clean(v, 500);
    }
    doc.socialLinks = next;
  }

  doc.updatedBy = req.user._id;
  await doc.save();
  await deleteCache(CACHE_KEY);
  return doc.toAdminObject();
}
