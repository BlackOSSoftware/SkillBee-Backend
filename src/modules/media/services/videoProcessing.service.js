import { env } from '../../../config/env.js';

/**
 * HLS/FFmpeg processing is intentionally outside request handlers.
 * When VIDEO_HLS_ENABLED=false, progressive source is ready for view-only playback.
 * When true, status stays pending until an external worker verifies HLS output.
 * Resumable/chunked uploads: NOT IMPLEMENTED.
 */
export function resolveVideoProcessingStatus() {
  if (env.VIDEO_HLS_ENABLED) {
    return {
      processingStatus: 'pending',
      availableQualities: [],
      hlsReady: false,
      note: 'Awaiting external FFmpeg/HLS worker',
    };
  }
  return {
    processingStatus: 'ready',
    availableQualities: ['source'],
    hlsReady: false,
    note: 'Progressive source ready for view-only playback (no fabricated HLS)',
  };
}
