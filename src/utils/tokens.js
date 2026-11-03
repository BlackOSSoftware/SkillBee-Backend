import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { security } from '../config/security.js';

export function signAccessToken(payload) {
  return jwt.sign(payload, security.accessToken.secret, {
    expiresIn: security.accessToken.expiresIn,
  });
}

export function signRefreshToken(payload) {
  return jwt.sign(
    { ...payload, jti: generateRawToken(16) },
    security.refreshToken.secret,
    {
      expiresIn: security.refreshToken.expiresIn,
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, security.accessToken.secret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, security.refreshToken.secret);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRawToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}
