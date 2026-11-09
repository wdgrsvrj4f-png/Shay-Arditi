import { accessKey } from '../lib/auth.mjs';
import { budgetStore } from '../lib/store.mjs';
import { cardSyncToken, sameToken } from '../lib/card.js';
import { pullCardTransactions } from '../lib/card-pull.mjs';
import { runCardSync } from '../lib/card-run.mjs';

export default async function handler(request) {
  const key = accessKey();
  if (!key) return new Response(null, { status: 503 });
  if (!sameToken(request.headers.get('x-card-sync-token') || '', cardSyncToken(key))) return new Response(null, { status: 401 });
  const store = await budgetStore();
  await runCardSync(store, { pull: pullCardTransactions, user: request.headers.get('x-card-sync-user') === '1' });
  return new Response(JSON.stringify({ ok: true }), { status: 202, headers: { 'Content-Type': 'application/json' } });
}
