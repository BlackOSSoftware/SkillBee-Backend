import rateLimit from 'express-rate-limit';
import { ROLE_SLUGS } from '../config/security.js';
import { env } from '../config/env.js';

/** Roles exempt from the public limiter. req.role is only set by optionalAuthenticate
 *  after a verified token + active user + active role — never client-supplied. */
const RATE_LIMIT_EXEMPT_ROLES = new Set([ROLE_SLUGS.SUPER_ADMIN, ROLE_SLUGS.ADMIN]);

const isDev = env.NODE_ENV === 'development';

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  // Generous limits in development so local testing across apps is not blocked
  max: isDev ? 10000 : env.RATE_LIMIT_MAX,
  skip: (req) => RATE_LIMIT_EXEMPT_ROLES.has(req.role?.slug),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later',
    },
  },
});

export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: isDev ? 1000 : env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many auth attempts, please try again later',
    },
  },
});

export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'UPLOAD_RATE_LIMITED',
      message: 'Too many uploads, please try again later',
    },
  },
});

export const quizStartRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'QUIZ_START_RATE_LIMITED',
      message: 'Too many quiz start attempts, please try again later',
    },
  },
});

export const quizSubmitRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'QUIZ_SUBMIT_RATE_LIMITED',
      message: 'Too many quiz submissions, please try again later',
    },
  },
});

/** Public marketing forms: instructor apply, newsletter, referrals */
export const publicFormRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'FORM_RATE_LIMITED',
      message: 'Too many form submissions, please try again later',
    },
  },
});

export const certificateVerifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'VERIFY_RATE_LIMITED',
      message: 'Too many verification attempts, please try again later',
    },
  },
});

export const assignmentSubmitRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'ASSIGNMENT_SUBMIT_RATE_LIMITED',
      message: 'Too many assignment submissions, please try again later',
    },
  },
});
