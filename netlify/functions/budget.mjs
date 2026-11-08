import { requireAuth } from '../lib/auth.mjs';
import { readJSON, reply } from '../lib/http.mjs';
import { budgetStore, readSnapshot, writeSnapshot } from '../lib/store.mjs';
import { validateState } from '../lib/validation.mjs';

function canonicalRevision(value) {
  const trimmed = String(value || '').trim().replace(/^W\//i, '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed;
  return `"${trimmed}"`;
}

export function publicState(data) {
  const { telegramChatId, processedTelegramUpdates, pendingTelegramExpense, ...budget } = data;
  return budget;
}
export function createBudgetHandler(getStore = budgetStore) {
  return async function handler(request) {
    const denied = requireAuth(request);
    if (denied) return denied;
    if (!['GET', 'PUT'].includes(request.method)) return reply({ error: 'Method not allowed' }, 405);
    try {
      const store = await getStore();
      if (request.method === 'GET') {
        const { data, revision } = await readSnapshot(store);
        return reply(publicState(data), 200, { ETag: revision, 'X-Budget-Revision': revision });
      }
      const revision = canonicalRevision(request.headers.get('x-budget-revision') || request.headers.get('if-match'));
      if (!revision) return reply({ error: 'Reload the updated app before saving' }, 428);
      const payload = await readJSON(request);
      if (!payload || typeof payload !== 'object') return reply({ error: 'Invalid budget data' }, 400);
      // Telegram routing and deduplication are server-owned, never client writable.
      delete payload.telegramChatId;
      delete payload.pendingTelegramExpense;
      payload.processedTelegramUpdates = [];
      const clean = validateState(payload);
      if (!clean) return reply({ error: 'Invalid budget data' }, 400);
      const current = await readSnapshot(store);
      if (canonicalRevision(current.revision) !== revision) return reply({ error: 'Budget changed; refresh and retry' }, 409);
      const next = { ...clean, telegramChatId: current.data.telegramChatId ?? null,
        processedTelegramUpdates: current.data.processedTelegramUpdates ?? [],
        pendingTelegramExpense: current.data.pendingTelegramExpense ?? null };
      if (!await writeSnapshot(store, next, current.revision)) return reply({ error: 'Budget changed; refresh and retry' }, 409);
      // Read back the current snapshot: a concurrent Telegram update may already
      // have committed, and clients must acknowledge that exact revision too.
      const saved = await readSnapshot(store);
      return reply(publicState(saved.data), 200, { ETag: saved.revision, 'X-Budget-Revision': saved.revision });
    } catch (error) {
      return reply({ error: error.status ? error.message : 'Storage unavailable' }, error.status || 503);
    }
  };
}
export default createBudgetHandler();
