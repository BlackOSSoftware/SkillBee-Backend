import { SeoRedirect } from '../../../models/SeoRedirect.js';
import { getOrSetCache, deleteCache } from '../../../services/cache/cache.service.js';
import { AppError } from '../../../utils/AppError.js';
import { buildPagination, getSkip } from '../../../utils/pagination.js';
import {
  absoluteUrl,
  getSiteOrigin,
  isAllowedExternalDestination,
  isSafeInternalPath,
  normalizePath,
} from '../utils/seoPaths.js';
import { getSettingsCached } from './seoSettings.service.js';
import { invalidateResolvePath, invalidateSeoCaches, SEO_CACHE } from './seoCache.service.js';

function assertDestination(dest, { allowExternal = false, siteUrl } = {}) {
  const value = String(dest || '').trim();
  if (!value) throw new AppError('Destination path is required', 400, 'INVALID_DESTINATION');

  if (/^https?:\/\//i.test(value)) {
    if (!allowExternal && !isAllowedExternalDestination(value, siteUrl)) {
      throw new AppError(
        'External redirects require allowExternal=true and same-origin or explicit authorization',
        400,
        'OPEN_REDIRECT_BLOCKED'
      );
    }
    return value.replace(/\/$/, '') || value;
  }

  if (!isSafeInternalPath(value)) {
    throw new AppError('Invalid destination path', 400, 'INVALID_DESTINATION');
  }
  return normalizePath(value);
}

async function wouldCreateLoop(sourcePath, destinationPath, excludeId = null) {
  const source = normalizePath(sourcePath);
  let dest = destinationPath;
  if (/^https?:\/\//i.test(dest)) {
    try {
      dest = normalizePath(new URL(dest).pathname);
    } catch {
      return false;
    }
  } else {
    dest = normalizePath(dest);
  }
  if (source === dest) return true;

  // Walk up to 5 hops from destination looking for source
  let current = dest;
  for (let i = 0; i < 5; i += 1) {
    const hop = await SeoRedirect.findOne({
      sourcePath: current,
      isActive: true,
      deletedAt: null,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('destinationPath');
    if (!hop) break;
    let next = hop.destinationPath;
    if (/^https?:\/\//i.test(next)) {
      try {
        next = normalizePath(new URL(next).pathname);
      } catch {
        break;
      }
    } else {
      next = normalizePath(next);
    }
    if (next === source) return true;
    current = next;
  }
  return false;
}

/** Flatten one-level chains: if dest is also a redirect source, point to final */
async function resolveChainDestination(destinationPath) {
  let dest = destinationPath;
  for (let i = 0; i < 5; i += 1) {
    const pathOnly = /^https?:\/\//i.test(dest)
      ? (() => {
          try {
            return normalizePath(new URL(dest).pathname);
          } catch {
            return null;
          }
        })()
      : normalizePath(dest);
    if (!pathOnly) return dest;
    const next = await SeoRedirect.findOne({
      sourcePath: pathOnly,
      isActive: true,
      deletedAt: null,
    }).select('destinationPath');
    if (!next) return dest;
    dest = next.destinationPath;
  }
  return dest;
}

export async function createRedirect(req, input) {
  const settings = await getSettingsCached();
  const sourcePath = normalizePath(input.sourcePath);
  if (!isSafeInternalPath(sourcePath)) {
    throw new AppError('Invalid source path', 400, 'INVALID_SOURCE');
  }
  const allowExternal = Boolean(input.allowExternal);
  let destinationPath = assertDestination(input.destinationPath, {
    allowExternal,
    siteUrl: settings.siteUrl,
  });
  destinationPath = await resolveChainDestination(destinationPath);

  if (await wouldCreateLoop(sourcePath, destinationPath)) {
    throw new AppError('Redirect would create a loop', 400, 'REDIRECT_LOOP');
  }

  try {
    const doc = await SeoRedirect.create({
      sourcePath,
      destinationPath,
      redirectType: input.redirectType === 302 ? 302 : 301,
      isActive: input.isActive !== false,
      allowExternal,
      createdBy: req.user._id,
      updatedBy: req.user._id,
      auditLog: [{ action: 'created', actorId: req.user._id, at: new Date() }],
    });
    await invalidateSeoCaches();
    return doc.toSafeObject();
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError('An active redirect already exists for this source', 409, 'DUPLICATE_REDIRECT');
    }
    throw err;
  }
}

export async function ensureCourseSlugRedirect({ oldSlug, newSlug, actorId }) {
  if (!oldSlug || !newSlug || oldSlug === newSlug) return null;
  const { coursePublicPath } = await import('../utils/seoPaths.js');
  const sourcePath = coursePublicPath(oldSlug);
  const destinationPath = coursePublicPath(newSlug);
  if (await wouldCreateLoop(sourcePath, destinationPath)) return null;

  const existing = await SeoRedirect.findOne({
    sourcePath,
    deletedAt: null,
  });
  if (existing) {
    existing.destinationPath = destinationPath;
    existing.redirectType = 301;
    existing.isActive = true;
    existing.updatedBy = actorId || null;
    existing.auditLog = existing.auditLog || [];
    existing.auditLog.push({
      action: 'slug_change_updated',
      actorId: actorId || null,
      at: new Date(),
      meta: { oldSlug, newSlug },
    });
    await existing.save();
    await invalidateSeoCaches();
    return existing.toSafeObject();
  }

  const doc = await SeoRedirect.create({
    sourcePath,
    destinationPath,
    redirectType: 301,
    isActive: true,
    createdBy: actorId || null,
    auditLog: [
      {
        action: 'slug_change_created',
        actorId: actorId || null,
        at: new Date(),
        meta: { oldSlug, newSlug },
      },
    ],
  });
  await invalidateSeoCaches();
  return doc.toSafeObject();
}

export async function listRedirects(query) {
  const filter = { deletedAt: null };
  if (query.isActive !== undefined) filter.isActive = query.isActive;
  if (query.redirectType) filter.redirectType = query.redirectType;
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ sourcePath: rx }, { destinationPath: rx }];
  }
  const skip = getSkip(query);
  const [rows, total] = await Promise.all([
    SeoRedirect.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    SeoRedirect.countDocuments(filter),
  ]);
  return {
    data: rows.map((r) => SeoRedirect.hydrate(r).toSafeObject()),
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  };
}

export async function updateRedirect(req, id, input) {
  const doc = await SeoRedirect.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Redirect not found', 404, 'REDIRECT_NOT_FOUND');
  const settings = await getSettingsCached();

  if (input.sourcePath !== undefined) {
    const sourcePath = normalizePath(input.sourcePath);
    if (!isSafeInternalPath(sourcePath)) {
      throw new AppError('Invalid source path', 400, 'INVALID_SOURCE');
    }
    doc.sourcePath = sourcePath;
  }
  if (input.destinationPath !== undefined || input.allowExternal !== undefined) {
    const allowExternal =
      input.allowExternal !== undefined ? Boolean(input.allowExternal) : doc.allowExternal;
    doc.allowExternal = allowExternal;
    const dest = assertDestination(input.destinationPath ?? doc.destinationPath, {
      allowExternal,
      siteUrl: settings.siteUrl,
    });
    doc.destinationPath = await resolveChainDestination(dest);
  }
  if (input.redirectType !== undefined) {
    doc.redirectType = input.redirectType === 302 ? 302 : 301;
  }
  if (input.isActive !== undefined) doc.isActive = Boolean(input.isActive);

  if (await wouldCreateLoop(doc.sourcePath, doc.destinationPath, doc._id)) {
    throw new AppError('Redirect would create a loop', 400, 'REDIRECT_LOOP');
  }

  doc.updatedBy = req.user._id;
  doc.auditLog = doc.auditLog || [];
  doc.auditLog.push({ action: 'updated', actorId: req.user._id, at: new Date() });
  try {
    await doc.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError('An active redirect already exists for this source', 409, 'DUPLICATE_REDIRECT');
    }
    throw err;
  }
  await invalidateSeoCaches();
  return doc.toSafeObject();
}

export async function deleteRedirect(req, id) {
  const doc = await SeoRedirect.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new AppError('Redirect not found', 404, 'REDIRECT_NOT_FOUND');
  doc.isActive = false;
  doc.deletedAt = new Date();
  doc.updatedBy = req.user._id;
  doc.auditLog = doc.auditLog || [];
  doc.auditLog.push({ action: 'deleted', actorId: req.user._id, at: new Date() });
  await doc.save();
  await invalidateSeoCaches();
  return doc.toSafeObject();
}

/**
 * Resolve active redirect for a path. Returns { status, location } or null.
 * location is absolute when possible.
 */
export async function resolveRedirect(pathInput, { trackHit = true } = {}) {
  const path = normalizePath(pathInput);
  const cacheKey = `${SEO_CACHE.redirectPrefix}${path}`;

  const cached = await getOrSetCache(cacheKey, 120, async () => {
    const doc = await SeoRedirect.findOne({
      sourcePath: path,
      isActive: true,
      deletedAt: null,
    }).lean();
    if (!doc) return { miss: true };
    return {
      miss: false,
      id: doc._id.toString(),
      redirectType: doc.redirectType,
      destinationPath: doc.destinationPath,
      allowExternal: doc.allowExternal,
    };
  });

  if (!cached || cached.miss) return null;

  const settings = await getSettingsCached();
  let location = cached.destinationPath;
  if (!/^https?:\/\//i.test(location)) {
    location = absoluteUrl(settings.siteUrl, location);
  }

  if (trackHit && cached.id) {
    SeoRedirect.updateOne(
      { _id: cached.id },
      { $inc: { hitCount: 1 }, $set: { lastAccessedAt: new Date() } }
    ).catch(() => undefined);
    // bust cache so hitCount updates don't matter for resolution
    await deleteCache(cacheKey).catch(() => undefined);
  }

  return {
    status: cached.redirectType === 302 ? 302 : 301,
    location,
    sourcePath: path,
  };
}

export async function buildLocationHeader(destinationPath, siteUrl) {
  if (/^https?:\/\//i.test(destinationPath)) return destinationPath;
  return absoluteUrl(siteUrl || getSiteOrigin(), destinationPath);
}
