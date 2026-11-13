// Accès admin : mot de passe unique (ADMIN_PASSWORD), session dans un cookie signé HMAC.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'pool_admin';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const SECRET = process.env.SESSION_SECRET || `pool:${PASSWORD}`;

const sign = (value) => createHmac('sha256', SECRET).update(value).digest('base64url');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const adminConfigured = () => PASSWORD.length > 0;
export const checkPassword = (pw) => adminConfigured() && safeEqual(pw, PASSWORD);

export function issueSession() {
  const value = `admin.${Date.now()}`;
  return `${value}.${sign(value)}`;
}

export function isAdminSession(cookieValue) {
  if (!adminConfigured() || typeof cookieValue !== 'string') return false;
  const i = cookieValue.lastIndexOf('.');
  if (i < 0) return false;
  const value = cookieValue.slice(0, i);
  if (!safeEqual(cookieValue.slice(i + 1), sign(value))) return false;
  const issued = Number(value.split('.')[1]);
  return Number.isFinite(issued) && Date.now() - issued < MAX_AGE_MS;
}

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.COOKIE_SECURE === 'true',
  maxAge: MAX_AGE_MS,
  path: '/',
});
