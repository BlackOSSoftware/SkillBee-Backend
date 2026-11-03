import adminMediaRoutes from './adminMedia.routes.js';
import mediaPlaybackRoutes from './mediaPlayback.routes.js';

export function mountMediaRoutes(app, apiPrefix) {
  app.use(`${apiPrefix}/admin/media`, adminMediaRoutes);
  app.use(`${apiPrefix}/learning/media`, mediaPlaybackRoutes);
}
