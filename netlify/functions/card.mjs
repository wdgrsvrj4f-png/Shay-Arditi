import { accessKey, requireAuth } from '../lib/auth.mjs';
import { budgetStore } from '../lib/store.mjs';
import { reply, readJSON } from '../lib/http.mjs';
import { cardCompanies, encryptCard, loginKey, publicCardStatus, syncKey } from '../lib/card.js';
import { triggerCardSync } from '../lib/card-trigger.mjs';

function cleanId(value) {
  return String(value || '').replace(/\s+/g, '');
}

export function createCardHandler(getStore = budgetStore, trigger = triggerCardSync) {
  return async function handler(request) {
    const denied = requireAuth(request);
    if (denied) return denied;
    const store = await getStore();
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const login = typeof store.get === 'function' ? await store.get(loginKey, { type: 'json' }) : null;
      const sync = typeof store.get === 'function' ? await store.get(syncKey, { type: 'json' }) : null;
      return reply(publicCardStatus(login, sync));
    }
    if (request.method === 'DELETE') {
      if (typeof store.delete === 'function') await store.delete(loginKey);
      return reply({ connected: false });
    }
    if (request.method === 'POST' && url.pathname.endsWith('/sync')) {
      const login = typeof store.get === 'function' ? await store.get(loginKey, { type: 'json' }) : null;
      if (!login?.secret) return reply({ error: 'עדיין אין סיסמה שמורה' }, 400);
      const started = await trigger({ user: true });
      return reply({ started }, started ? 202 : 503);
    }
    if (request.method !== 'PUT') return reply({ error: 'Method not allowed' }, 405);
    const key = accessKey();
    if (!key) return reply({ error: 'Access setup required' }, 503);
    let body;
    try { body = await readJSON(request, 8_000); }
    catch (error) { return reply({ error: error.message }, error.status || 400); }
    const company = String(body?.company || '');
    const idNumber = cleanId(body?.idNumber);
    const card6Digits = cleanId(body?.card6Digits);
    const password = String(body?.password || '');
    if (!cardCompanies[company] || !/^[\dA-Za-z]{4,30}$/.test(idNumber) || password.length < 4 || password.length > 100) {
      return reply({ error: 'פרטי הכרטיס לא תקינים' }, 400);
    }
    if (cardCompanies[company].digits && !/^\d{6}$/.test(card6Digits)) return reply({ error: 'צריך 6 ספרות אחרונות של הכרטיס' }, 400);
    await store.setJSON(loginKey, {
      v: 1, company, updatedAt: new Date().toISOString(),
      secret: encryptCard({ idNumber, card6Digits, password }, key),
    });
    return reply({ connected: true, company });
  };
}

export default createCardHandler();
