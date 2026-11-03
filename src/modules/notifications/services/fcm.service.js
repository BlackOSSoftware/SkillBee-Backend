import { getFirebaseMessaging } from '../../../config/firebase.js';
import { DeviceToken } from '../../../models/DeviceToken.js';

/**
 * Send multicast FCM. Deactivates invalid tokens. Never throws to callers.
 */
export async function sendPushToTokens(tokens, { title, body, data = {} }) {
  const unique = [...new Set((tokens || []).filter(Boolean))];
  if (!unique.length) {
    return { successCount: 0, failureCount: 0, skipped: true, reason: 'no_tokens' };
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return { successCount: 0, failureCount: 0, skipped: true, reason: 'firebase_unavailable' };
  }

  const stringData = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v == null) continue;
    // FCM data values must be strings; never include secrets
    if (/password|token|secret|key|otp/i.test(k)) continue;
    stringData[String(k)] = String(v).slice(0, 500);
  }

  try {
    const response = await messaging.sendEachForMulticast({
      tokens: unique,
      notification: { title: String(title).slice(0, 200), body: String(body).slice(0, 1000) },
      data: stringData,
    });

    const invalid = [];
    (response.responses || []).forEach((r, i) => {
      if (r.success) return;
      const code = r.error?.code || '';
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        code.includes('invalid-argument')
      ) {
        invalid.push(unique[i]);
      }
    });

    if (invalid.length) {
      await DeviceToken.updateMany(
        { token: { $in: invalid } },
        { $set: { isActive: false } }
      );
    }

    return {
      successCount: response.successCount || 0,
      failureCount: response.failureCount || 0,
      invalidTokenCount: invalid.length,
      skipped: false,
    };
  } catch (err) {
    return {
      successCount: 0,
      failureCount: unique.length,
      skipped: false,
      error: String(err.message || err).slice(0, 300),
    };
  }
}

export async function sendPushToUser(userId, payload) {
  const devices = await DeviceToken.find({
    userId,
    isActive: true,
  })
    .select('token')
    .lean();
  const tokens = devices.map((d) => d.token);
  return sendPushToTokens(tokens, payload);
}
