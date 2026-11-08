import { createHash, createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { reply } from './http.mjs';

const cookieName = 'budget_session';
const maxAge = 60 * 60 * 24 * 7;
export function accessKey() {
  const key = process.env.BUDGET_ACCESS_KEY || '';
  return key.length >= 32 ? key : null;
}
export function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
function signature(value, key) { return createHmac('sha256', key).update(`budget-session:${value}`).digest('base64url'); }
export function sessionCookie(key, { clear = false } = {}) {
  const payload = `${Math.floor(Date.now() / 1000) + maxAge}.${randomBytes(16).toString('hex')}`;
  const value = clear ? '' : `${payload}.${signature(payload, key)}`;
  // The only exception is the explicitly local demo process; deployed functions
  // always use HTTPS-only cookies, including on direct function URLs.
  const secure = process.env.BUDGET_LOCAL_DEMO === '1' && !process.env.NETLIFY ? '' : '; Secure';
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : maxAge}${secure}`;
}
export function authenticated(request) {
  const key = accessKey();
  if (!key) return false;
  const value = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!value || value.length > 256) return false;
  const [expires, nonce, mac, ...extra] = value.split('.');
  if (extra.length || !/^\d+$/.test(expires || '') || !/^[a-f0-9]{32}$/.test(nonce || '')) return false;
  const now = Math.floor(Date.now() / 1000);
  return Number(expires) > now && Number(expires) <= now + maxAge && sameSecret(mac, signature(`${expires}.${nonce}`, key));
}
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return (!origin || origin === new URL(request.url).origin)
    && request.headers.get('sec-fetch-site') !== 'cross-site';
}
export function requireAuth(request) {
  if (!accessKey()) return reply({ error: 'Access setup required' }, 503);
  if (!authenticated(request)) return reply({ error: 'Unauthorized' }, 401);
  if (!['GET', 'HEAD'].includes(request.method) && !sameOrigin(request)) return reply({ error: 'Forbidden origin' }, 403);
  return null;
}
