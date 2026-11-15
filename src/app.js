import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { openApiSpec } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { optionalAuthenticate } from './middleware/authenticate.js';
import { globalRateLimiter } from './middleware/rateLimiters.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { mountCourseRoutes } from './modules/courses/routes/index.js';
import { mountMediaRoutes } from './modules/media/routes/index.js';
import { mountQuizRoutes } from './modules/quizzes/routes/index.js';
import { mountAssignmentRoutes } from './modules/assignments/routes/index.js';
import { mountEnrollmentRoutes } from './modules/enrollment/routes/index.js';
import { mountCertificateRoutes } from './modules/certificates/routes/index.js';
import {
  mountCommerceRoutes,
  mountPayPalWebhookRoute,
  mountRazorpayWebhookRoute,
} from './modules/commerce/routes/index.js';
import { mountQaRoutes } from './modules/qa/routes/index.js';
import { mountSeoRoutes } from './modules/seo/routes/index.js';
import { mountSiteSettingsRoutes } from './modules/siteSettings/routes/index.js';
import { mountNotificationRoutes } from './modules/notifications/routes/index.js';
import { mountEmailRoutes } from './modules/email/routes/index.js';
import { mountInstructorApplicationRoutes } from './modules/instructorApplications/routes/index.js';
import { mountNewsletterRoutes } from './modules/newsletter/routes/index.js';
import { mountReferralRoutes } from './modules/referrals/routes/index.js';
import { mountFaqRoutes } from './modules/faqs/routes/index.js';
import { mountBlogRoutes } from './modules/blogs/routes/index.js';
import { mountContactRoutes } from './modules/contact/routes/index.js';
import { mountLiveApplicationRoutes } from './modules/liveApplications/routes/index.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  // Helmet default CSP blanks Swagger UI (esp. mobile browsers). Allow inline for docs assets.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'script-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:', 'validator.swagger.io'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'worker-src': ["'self'", 'blob:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(
    cors({
      // Allowed frontend origins: student app (3000), admin console (3001), instructor console (3002)
      origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'https://skill-nee-learner.vercel.app', 'https://skillbee-controller.vercel.app'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Upload-Token',
        'X-View-Token',
        'X-Playback-Token',
        'X-App-Scope',
        'Range',
        'X-Razorpay-Signature',
        'PayPal-Transmission-Id',
        'PayPal-Transmission-Time',
        'PayPal-Transmission-Sig',
        'PayPal-Cert-Url',
        'PayPal-Auth-Algo',
      ],
      exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Disposition'],
    })
  );

  // Razorpay webhook needs raw body for signature verification — before JSON parser
  mountRazorpayWebhookRoute(app, env.API_PREFIX);
  // PayPal webhook verified via PayPal API (JSON body + transmission headers)
  mountPayPalWebhookRoute(app, env.API_PREFIX);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  if (env.NODE_ENV !== 'test') {
    // Resolve the session (non-blocking) so the limiter can exempt admin roles.
    app.use(optionalAuthenticate);
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
    app.use(globalRateLimiter);
  }

  app.get('/health', async (_req, res) => {
    const { redisHealthCheck } = await import('./config/redis.js');
    const { getFirebaseStatus } = await import('./config/firebase.js');
    const { getSmtpStatus } = await import('./config/smtp.js');
    const { getEmailQueueStatus } = await import(
      './modules/email/services/emailQueue.service.js'
    );
    const redis = await redisHealthCheck();
    const firebase = getFirebaseStatus();
    const smtp = getSmtpStatus();
    const emailQueue = getEmailQueueStatus();
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        env: env.NODE_ENV,
        timestamp: new Date().toISOString(),
        redis: {
          enabled: redis.enabled,
          ok: redis.ok,
          status: redis.status,
          latencyMs: redis.latencyMs,
        },
        firebase: {
          enabled: firebase.enabled,
          configured: firebase.configured,
          ready: firebase.ready,
        },
        smtp: {
          enabled: smtp.enabled,
          configured: smtp.configured,
          ready: smtp.ready,
          verified: smtp.verified,
          host: smtp.host,
        },
        emailQueue,
      },
    });
  });

  function buildOpenApiForRequest(req) {
    const host = req.get('host') || `localhost:${env.PORT}`;
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    return {
      ...openApiSpec,
      servers: [
        {
          url: `${proto}://${host}${env.API_PREFIX}`,
          description: 'Current host (LAN / phone / localhost)',
        },
      ],
    };
  }

  // Spec is host-aware so phone uses http://<pc-ip>:5000 instead of localhost
  app.get(`${env.API_PREFIX}/docs.json`, (req, res) => {
    res.json(buildOpenApiForRequest(req));
  });

  app.use(
    `${env.API_PREFIX}/docs`,
    swaggerUi.serve,
    swaggerUi.setup(null, {
      customSiteTitle: 'Skillbee API Docs',
      swaggerOptions: {
        url: `${env.API_PREFIX}/docs.json`,
        displayRequestDuration: true,
      },
    })
  );

  app.use(`${env.API_PREFIX}/auth`, authRoutes);
  // Mount media before courses: /learning/media/* must be handled by the media
  // playback router (token-authorized stream). learning.routes has a
  // router.use(authenticate) that would otherwise 401 those requests first.
  mountMediaRoutes(app, env.API_PREFIX);
  mountCourseRoutes(app, env.API_PREFIX);
  mountQuizRoutes(app, env.API_PREFIX);
  mountAssignmentRoutes(app, env.API_PREFIX);
  mountEnrollmentRoutes(app, env.API_PREFIX);
  mountCertificateRoutes(app, env.API_PREFIX);
  mountCommerceRoutes(app, env.API_PREFIX);
  mountQaRoutes(app, env.API_PREFIX);
  mountSeoRoutes(app, env.API_PREFIX);
  mountSiteSettingsRoutes(app, env.API_PREFIX);
  mountNotificationRoutes(app, env.API_PREFIX);
  mountEmailRoutes(app, env.API_PREFIX);
  mountInstructorApplicationRoutes(app, env.API_PREFIX);
  mountNewsletterRoutes(app, env.API_PREFIX);
  mountReferralRoutes(app, env.API_PREFIX);
  mountFaqRoutes(app, env.API_PREFIX);
  mountContactRoutes(app, env.API_PREFIX);
  mountLiveApplicationRoutes(app, env.API_PREFIX);
  mountBlogRoutes(app, env.API_PREFIX);
  app.use(`${env.API_PREFIX}/admin`, adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
