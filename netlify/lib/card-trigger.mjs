import { accessKey } from './auth.mjs';
import { cardSyncToken } from './card.js';

export async function triggerCardSync({ user = false } = {}) {
  const key = accessKey();
  const site = process.env.URL;
  if (!key || !site) return false;
  const response = await fetch(new URL('/.netlify/functions/card-sync-background', site), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-card-sync-token': cardSyncToken(key),
      ...(user ? { 'x-card-sync-user': '1' } : {}),
    },
    body: '{}',
  });
  return response.status === 202 || response.status === 200;
}
