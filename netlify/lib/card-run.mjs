import { accessKey } from './auth.mjs';
import { readSnapshot, writeSnapshot } from './store.mjs';
import { validateState } from './validation.mjs';
import { cardTransactionsToBudget, decryptCard, loginKey, otpKey, safeCardError, syncKey } from './card.js';

async function readBlob(store, key) {
  if (typeof store.get !== 'function') return null;
  return await store.get(key, { type: 'json' }) ?? null;
}

async function notify(token, chatId, text, callTelegram) {
  if (!token || !chatId || !text) return;
  const send = callTelegram || (async (bot, method, body) => {
    await fetch(`https://api.telegram.org/bot${bot}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  });
  try { await send(token, 'sendMessage', { chat_id: chatId, text }); }
  catch { /* A failed notice must not expose the card login or stop the sync. */ }
}

export async function runCardSync(store, { pull, callTelegram, user = false } = {}) {
  const key = accessKey();
  const login = await readBlob(store, loginKey);
  const previous = await readBlob(store, syncKey) || {};
  if (previous.status === 'running' && Date.now() - Number(previous.startedAt) < 12 * 60 * 1000) return { skipped: true };
  if (!user && previous.lastSync && Date.now() - Date.parse(previous.lastSync) < 20 * 60 * 60 * 1000) return { skipped: true };
  const chatId = (await readSnapshot(store)).data?.telegramChatId || null;
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!login?.secret || !login.company) {
    const lastError = safeCardError('MISSING');
    await store.setJSON(syncKey, { ...previous, status: 'idle', needsOtp: false, lastError, startedAt: 0 });
    await notify(token, chatId, lastError, callTelegram);
    return { added: 0, error: 'MISSING' };
  }
  await store.setJSON(syncKey, { ...previous, status: 'running', needsOtp: false, startedAt: Date.now(), lastError: '' });
  try {
    const secret = decryptCard(login.secret, key);
    const since = new Date();
    since.setDate(since.getDate() - 45);
    const rows = await pull({ company: login.company, ...secret }, {
      since,
      otpCodeRetriever: async () => {
        await store.setJSON(syncKey, { ...(await readBlob(store, syncKey) || {}), status: 'running', needsOtp: true, startedAt: Date.now() });
        await notify(token, chatId, 'נשלח קוד לטלפון. שלח לכאן רק את הספרות.', callTelegram);
        const deadline = Date.now() + 3 * 60 * 1000;
        while (Date.now() < deadline) {
          const otp = await readBlob(store, otpKey);
          if (otp?.code && Number(otp.expires) > Date.now()) {
            if (typeof store.delete === 'function') await store.delete(otpKey);
            return String(otp.code);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        throw Object.assign(new Error('otp'), { code: 'TWO_FACTOR' });
      },
    });
    let added = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      const snapshot = await readSnapshot(store);
      const state = snapshot.data;
      if (state?.version !== 2) throw Object.assign(new Error('budget'), { code: 'GENERIC' });
      const fresh = cardTransactionsToBudget(rows, {
        company: login.company, settings: state.settings, existing: state.transactions, deletedIds: state.deletedTransactionIds,
      });
      if (!fresh.length) { added = 0; break; }
      const next = { ...state, transactions: [...state.transactions, ...fresh] };
      if (!validateState(structuredClone(next))) throw Object.assign(new Error('invalid'), { code: 'GENERIC' });
      if (await writeSnapshot(store, next, snapshot.revision)) { added = fresh.length; break; }
      if (attempt === 5) throw Object.assign(new Error('conflict'), { code: 'GENERIC' });
    }
    await store.setJSON(syncKey, { status: 'idle', needsOtp: false, startedAt: 0, lastSync: new Date().toISOString(), lastError: '', lastAdded: added });
    await notify(token, chatId, added ? `נמשכו ${added} עסקאות חדשות מהכרטיס.` : 'אין עסקאות חדשות בכרטיס.', callTelegram);
    return { added };
  } catch (error) {
    const code = error.code || 'GENERIC';
    const lastError = safeCardError(code);
    await store.setJSON(syncKey, { status: 'idle', needsOtp: false, startedAt: 0, lastSync: previous.lastSync || null, lastError, lastAdded: 0 });
    await notify(token, chatId, lastError, callTelegram);
    return { added: 0, error: code };
  }
}
