import { DeviceToken } from '../../../models/DeviceToken.js';
import { AppError } from '../../../utils/AppError.js';

export async function registerDevice(req, input) {
  const token = String(input.token || '').trim();
  if (!token || token.length < 20) {
    throw new AppError('Invalid device token', 400, 'INVALID_DEVICE_TOKEN');
  }

  // Reassign token if previously owned by another user (token refresh / device switch)
  const existing = await DeviceToken.findOne({ token });
  if (existing) {
    existing.userId = req.user._id;
    existing.platform = input.platform || existing.platform || 'web';
    existing.deviceName = input.deviceName != null ? String(input.deviceName).slice(0, 120) : existing.deviceName;
    existing.isActive = true;
    existing.lastUsedAt = new Date();
    await existing.save();
    return existing.toSafeObject();
  }

  try {
    const doc = await DeviceToken.create({
      userId: req.user._id,
      token,
      platform: input.platform || 'web',
      deviceName: String(input.deviceName || '').slice(0, 120),
      isActive: true,
      lastUsedAt: new Date(),
    });
    return doc.toSafeObject();
  } catch (err) {
    if (err?.code === 11000) {
      const again = await DeviceToken.findOne({ token });
      if (again) {
        again.userId = req.user._id;
        again.isActive = true;
        again.lastUsedAt = new Date();
        await again.save();
        return again.toSafeObject();
      }
    }
    throw err;
  }
}

export async function listMyDevices(req) {
  const rows = await DeviceToken.find({
    userId: req.user._id,
    isActive: true,
  })
    .sort({ lastUsedAt: -1 })
    .lean();
  return rows.map((r) => DeviceToken.hydrate(r).toSafeObject());
}

export async function removeDevice(req, id) {
  const doc = await DeviceToken.findOne({ _id: id, userId: req.user._id });
  if (!doc) throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
  doc.isActive = false;
  await doc.save();
  return doc.toSafeObject();
}
