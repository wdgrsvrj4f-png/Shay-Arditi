import { accessKey, authenticated, sameOrigin, sameSecret, sessionCookie } from '../lib/auth.mjs';
import { readJSON, reply } from '../lib/http.mjs';

export default async function handler(request) {
  const key = accessKey();
  if (!key) return reply({ error: 'Access setup required' }, 503);
  if (request.method === 'GET') return reply({ authenticated: authenticated(request) });
  if (!sameOrigin(request)) return reply({ error: 'Forbidden origin' }, 403);
  if (request.method === 'DELETE') return reply({ ok: true }, 200, { 'Set-Cookie': sessionCookie(key, { clear: true }) });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const body = await readJSON(request, 2048);
    if (!sameSecret(body?.key, key)) return reply({ error: 'Invalid access key' }, 401);
    return reply({ ok: true }, 200, { 'Set-Cookie': sessionCookie(key) });
  } catch (error) { return reply({ error: error.message }, error.status || 400); }
}
