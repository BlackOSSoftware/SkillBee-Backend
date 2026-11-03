import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

let app = null;
let messaging = null;
let initError = null;
let initAttempted = false;

function loadServiceAccountFromFile() {
  const rawPath = env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!rawPath) return null;
  const resolved = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(process.cwd(), rawPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Firebase service account file not found: ${resolved}`);
  }
  const json = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!json.project_id || !json.client_email || !json.private_key) {
    throw new Error('Firebase service account JSON missing required fields');
  }
  return {
    projectId: json.project_id,
    clientEmail: json.client_email,
    privateKey: String(json.private_key).replace(/\\n/g, '\n'),
  };
}

function resolveCredentials() {
  try {
    const fromFile = loadServiceAccountFromFile();
    if (fromFile) return fromFile;
  } catch (err) {
    initError = err;
    return null;
  }

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY,
    };
  }
  return null;
}

export function getFirebaseStatus() {
  const configured = Boolean(
    env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY)
  );
  return {
    enabled: env.FIREBASE_ENABLED,
    configured,
    ready: Boolean(messaging),
    viaFile: Boolean(env.FIREBASE_SERVICE_ACCOUNT_PATH),
    error: initError ? String(initError.message || initError) : null,
  };
}

/**
 * Lazy-init Firebase Admin once. Never logs private keys.
 * Supports FIREBASE_SERVICE_ACCOUNT_PATH JSON file OR env vars.
 */
export async function getFirebaseMessaging() {
  // Allow test-injected mock even when FIREBASE_ENABLED=false
  if (messaging) return messaging;
  if (!env.FIREBASE_ENABLED) return null;
  if (initAttempted && !messaging) return null;

  initAttempted = true;
  const creds = resolveCredentials();
  if (!creds) {
    initError = initError || new Error('Firebase credentials incomplete');
    return null;
  }

  try {
    const admin = await import('firebase-admin');
    if (!admin.apps.length) {
      app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: creds.projectId,
          clientEmail: creds.clientEmail,
          privateKey: creds.privateKey,
        }),
      });
    } else {
      app = admin.app();
    }
    messaging = admin.messaging(app);
    initError = null;
    return messaging;
  } catch (err) {
    initError = err;
    if (env.NODE_ENV !== 'test') {
      console.warn('[firebase] init failed:', err.message);
    }
    return null;
  }
}

/** Test helper — inject mock messaging */
export function _setFirebaseMessagingForTests(mock) {
  messaging = mock;
  initAttempted = true;
  initError = null;
}

export function _resetFirebaseForTests() {
  app = null;
  messaging = null;
  initError = null;
  initAttempted = false;
}
