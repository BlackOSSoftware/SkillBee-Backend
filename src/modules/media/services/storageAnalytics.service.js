import fs from 'fs/promises';
import path from 'path';
import { env } from '../../../config/env.js';
import { MediaAsset } from '../../../models/MediaAsset.js';
import { getUploadRoot } from '../utils/storagePath.js';

let cache = { at: 0, data: null };

async function diskStats() {
  const root = getUploadRoot();
  try {
    await fs.mkdir(root, { recursive: true });
    if (typeof fs.statfs !== 'function') {
      return {
        totalBytes: null,
        usedBytes: null,
        availableBytes: null,
        usagePercent: null,
        unavailableReason: 'statfs_not_supported',
      };
    }
    const stats = await fs.statfs(root);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const availableBytes = Number(stats.bavail) * Number(stats.bsize);
    const usedBytes = totalBytes - availableBytes;
    return {
      totalBytes,
      usedBytes,
      availableBytes,
      usagePercent: totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(2)) : 0,
    };
  } catch (err) {
    return {
      totalBytes: null,
      usedBytes: null,
      availableBytes: null,
      usagePercent: null,
      unavailableReason: err.message,
    };
  }
}

export async function getStorageStatistics({ force = false } = {}) {
  const ttlMs = env.STORAGE_STATS_CACHE_SECONDS * 1000;
  if (!force && cache.data && Date.now() - cache.at < ttlMs) {
    return { ...cache.data, cached: true };
  }

  const [server, videoAgg, docAgg, imageAgg, totalCount] = await Promise.all([
    diskStats(),
    MediaAsset.aggregate([
      { $match: { deletedAt: null, mediaType: 'video', storageProvider: 'local' } },
      { $group: { _id: null, count: { $sum: 1 }, totalBytes: { $sum: '$sizeBytes' } } },
    ]),
    MediaAsset.aggregate([
      { $match: { deletedAt: null, mediaType: 'document', storageProvider: 'local' } },
      { $group: { _id: null, count: { $sum: 1 }, totalBytes: { $sum: '$sizeBytes' } } },
    ]),
    MediaAsset.aggregate([
      { $match: { deletedAt: null, mediaType: 'image', storageProvider: 'cloudinary' } },
      { $group: { _id: null, count: { $sum: 1 }, totalBytes: { $sum: '$sizeBytes' } } },
    ]),
    MediaAsset.countDocuments({ deletedAt: null }),
  ]);

  const videos = videoAgg[0] || { count: 0, totalBytes: 0 };
  const documents = docAgg[0] || { count: 0, totalBytes: 0 };
  const images = imageAgg[0] || { count: 0, totalBytes: 0 };

  const data = {
    server,
    localMedia: {
      videos: { count: videos.count, totalBytes: videos.totalBytes },
      documents: { count: documents.count, totalBytes: documents.totalBytes },
      root: path.basename(getUploadRoot()),
    },
    cloudinary: {
      images: {
        count: images.count,
        totalBytes: images.totalBytes,
        source: 'database_metadata',
      },
    },
    totals: {
      mediaCount: totalCount,
      localBytes: (videos.totalBytes || 0) + (documents.totalBytes || 0),
      cloudinaryBytes: images.totalBytes || 0,
    },
    cached: false,
    generatedAt: new Date().toISOString(),
  };

  cache = { at: Date.now(), data };
  return data;
}
