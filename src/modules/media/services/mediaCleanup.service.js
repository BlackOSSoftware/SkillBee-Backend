import { MediaUploadSession } from '../../../models/MediaUploadSession.js';
import { deleteLocalKey } from './localStorage.service.js';

export async function cleanupExpiredSessions() {
  const now = new Date();
  const expired = await MediaUploadSession.find({
    expiresAt: { $lt: now },
    status: { $in: ['initiated', 'uploading', 'uploaded', 'failed'] },
  }).limit(100);

  for (const session of expired) {
    if (session.temporaryStorageKey) {
      await deleteLocalKey(session.temporaryStorageKey);
    }
    session.status = 'expired';
    await session.save();
  }
  return { cleaned: expired.length };
}
