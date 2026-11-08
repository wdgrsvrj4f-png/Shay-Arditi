import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { commitmentAmount, cardGroups } from '../shared/budget.js';
import { mergeChanges, migrateLegacyPending } from '../shared/sync.js';
import { createBudgetHandler } from '../netlify/functions/budget.mjs';
import { createTelegramHandler } from '../netlify/functions/telegram.mjs';
import session from '../netlify/functions/session.mjs';
import { sessionCookie } from '../netlify/lib/auth.mjs';
import { validateState } from '../netlify/lib/validation.mjs';
import { memoryStore } from '../scripts/memory-store.mjs';
import { demoData } from '../scripts/demo-data.mjs';

process.env.BUDGET_ACCESS_KEY = 'test-only-access-key-32-characters-long';
const origin = 'https://budget.example';
const cookie = () => sessionCookie(process.env.BUDGET_ACCESS_KEY).split(';')[0];
function request(path, { method = 'GET', body, revision, authorized = true, headers = {} } = {}) {
  return new Request(`${origin}${path}`, { method, headers: {
    ...(authorized ? { cookie: cookie() } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(revision ? { 'If-Match': revision } : {}), ...headers,
  }, body: body ? JSON.stringify(body) : undefined });
}

test('monthly debt uses monthlyPayment; fixed costs use amount', () => {
  assert.equal(commitmentAmount({ kind: 'debt', monthlyPayment: 1000 }), 1000);
  assert.equal(commitmentAmount({ kind: 'fixed', amount: 100 }), 100);
  assert.throws(() => commitmentAmount({ kind: 'debt' }));
});
test('old manual bill adds to newly tracked purchases and settles once', () => {
  const state = demoData(); const group = cardGroups(state)[0];
  assert.equal(group.amount, 3700);
  assert.deepEqual(group.paymentIds, ['demo-old-bill']);
  state.creditPayments = [{ id: 'settled', status: 'paid', amount: 3700, dueDate: group.dueDate, paidDate: '2026-12-02', expenseIds: group.expenseIds }];
  assert.equal(cardGroups(state).length, 0);
});
test('full statement covers existing purchases but includes later purchases', () => {
  const state = demoData();
  Object.assign(state.creditPayments[0], { amountMode: 'statement', coveredExpenseIds: ['demo-card'] });
  assert.equal(cardGroups(state)[0].amount, 3500);
  state.transactions.push({ ...state.transactions[0], id: 'later', amount: 50 });
  assert.equal(cardGroups(state)[0].amount, 3550);
});
test('multiple previous balances on one due date are summed', () => {
  const state = demoData(); state.creditPayments.push({ ...state.creditPayments[0], id: 'second', amount: 400 });
  assert.equal(cardGroups(state)[0].amount, 4100);
});
test('refresh never restores stale settings, debt balances or pending credit status', () => {
  const base = demoData(); const local = structuredClone(base); const remote = structuredClone(base);
  remote.settings.openingBankBalance = 18000; remote.debts[0].balance = 11000;
  remote.creditPayments[0].status = 'paid'; remote.creditPayments[0].paidDate = '2026-11-08';
  const result = mergeChanges(base, local, remote);
  assert.deepEqual(result.state, remote); assert.deepEqual(result.conflicts, []);
});
test('independent offline edits merge; duplicate concurrent expense IDs do not duplicate', () => {
  const base = demoData(), local = structuredClone(base), remote = structuredClone(base);
  local.settings.budgets.fuel = 900; remote.settings.budgets.groceries = 2200;
  const tx = { ...base.transactions[0], id: 'new', amount: 40 }; local.transactions.push(tx); remote.transactions.push(tx);
  const result = mergeChanges(base, local, remote);
  assert.equal(result.state.settings.budgets.fuel, 900); assert.equal(result.state.settings.budgets.groceries, 2200);
  assert.equal(result.state.transactions.length, 2); assert.equal(result.conflicts.length, 0);
});
test('same-field conflict is reported and explicit choices preserve unrelated edits', () => {
  const base = demoData(), local = structuredClone(base), remote = structuredClone(base);
  local.debts[0].balance = 9000; remote.debts[0].balance = 10000; local.settings.budgets.fuel = 700;
  assert.equal(mergeChanges(base, local, remote).conflicts.length, 1);
  assert.equal(mergeChanges(base, local, remote).state.debts[0].balance, 10000);
  const chosen = mergeChanges(base, local, remote, { preferLocal: true });
  assert.equal(chosen.state.debts[0].balance, 9000); assert.equal(chosen.state.settings.budgets.fuel, 700);
});
test('deletions survive stale devices; old pending clients prompt before overwriting', () => {
  const base = demoData(), remote = structuredClone(base);
  remote.deletedDebtIds = ['demo-loan']; remote.debts = [];
  assert.equal(mergeChanges(base, base, remote).state.debts.length, 0);
  const old = demoData(); old.settings.openingBankBalance = 7000;
  assert.ok(migrateLegacyPending(old, base).conflicts.length > 0);
});
test('unauthenticated reads/writes and cross-origin writes are rejected', async () => {
  const handler = createBudgetHandler(async () => memoryStore(demoData()));
  assert.equal((await handler(request('/api/budget', { authorized: false }))).status, 401);
  assert.equal((await handler(request('/api/budget', { method: 'PUT', body: demoData(), authorized: false }))).status, 401);
  assert.equal((await handler(request('/api/budget', { method: 'PUT', body: demoData(), headers: { origin: 'https://evil.example' } }))).status, 403);
});
test('login sets HttpOnly HTTPS cookie; invalid key and forged cookie fail', async () => {
  const ok = await session(request('/api/session', { method: 'POST', authorized: false, body: { key: process.env.BUDGET_ACCESS_KEY } }));
  assert.equal(ok.status, 200); assert.match(ok.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/); assert.match(ok.headers.get('set-cookie'), /Secure/);
  assert.equal((await session(request('/api/session', { method: 'POST', body: { key: 'wrong' } }))).status, 401);
  const forged = await session(request('/api/session', { headers: { cookie: 'budget_session=9999999999.fake.forged' } }));
  assert.equal((await forged.json()).authenticated, false);
});
test('server fails closed without access configuration', async () => {
  const original = process.env.BUDGET_ACCESS_KEY; delete process.env.BUDGET_ACCESS_KEY;
  try {
    assert.equal((await session(request('/api/session', { authorized: false }))).status, 503);
    assert.equal((await createBudgetHandler(async () => { throw new Error('must not access store'); })(request('/api/budget', { authorized: false }))).status, 503);
  } finally { process.env.BUDGET_ACCESS_KEY = original; }
});
test('ETag writes preserve Telegram private state and reject stale/missing revisions', async () => {
  const initial = demoData(); initial.telegramChatId = '123'; initial.processedTelegramUpdates = [25];
  const store = memoryStore(initial), handler = createBudgetHandler(async () => store);
  const get = await handler(request('/api/budget')); const data = await get.json(), revision = get.headers.get('etag');
  assert.equal(data.telegramChatId, undefined);
  data.settings.budgets.fuel = 123; data.telegramChatId = 'attacker';
  assert.equal((await handler(request('/api/budget', { method: 'PUT', body: data }))).status, 428);
  assert.equal((await handler(request('/api/budget', { method: 'PUT', body: data, revision }))).status, 200);
  const latest = await handler(request('/api/budget'));
  const nextRevision = latest.headers.get('etag');
  const next = await latest.json();
  next.settings.budgets.fuel = 124;
  assert.equal((await handler(request('/api/budget', { method: 'PUT', body: next, headers: { 'X-Budget-Revision': nextRevision } }))).status, 200);
  assert.equal((await handler(request('/api/budget', { method: 'PUT', body: data, revision }))).status, 409);
  assert.equal((await store.getWithMetadata()).data.telegramChatId, '123');
});
test('two simultaneous writers cannot both commit the same revision', async () => {
  const store = memoryStore(demoData()), handler = createBudgetHandler(async () => store);
  const get = await handler(request('/api/budget')), data = await get.json(), revision = get.headers.get('etag');
  const a = structuredClone(data), b = structuredClone(data); a.settings.budgets.fuel = 10; b.settings.budgets.fuel = 20;
  const results = await Promise.all([a, b].map(body => handler(request('/api/budget', { method: 'PUT', body, revision }))));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});
test('first write uses onlyIfNew; invalid dates, duplicate IDs, and oversized payloads are rejected', async () => {
  const store = memoryStore(), handler = createBudgetHandler(async () => store);
  const get = await handler(request('/api/budget')); const revision = get.headers.get('etag');
  assert.equal((await handler(request('/api/budget', { method: 'PUT', body: demoData(), revision }))).status, 200);
  const invalid = demoData(); invalid.settings.openingDate = '2026-02-30'; assert.equal(validateState(invalid), null);
  const duplicate = demoData(); duplicate.transactions.push(duplicate.transactions[0]); assert.equal(validateState(duplicate), null);
  const huge = { ...demoData(), padding: 'x'.repeat(260000) };
  assert.equal((await handler(request('/api/budget', { method: 'PUT', body: huge, revision }))).status, 413);
});
test('Telegram retries concurrent storage writes and deduplicates delivery', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token'; process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook'; process.env.TELEGRAM_PAIRING_CODE = 'test-pair';
  const initial = demoData(); initial.telegramChatId = '123'; const store = memoryStore(initial);
  const replies = []; const handler = createTelegramHandler(async () => store, async (token, method, body) => { replies.push({ method, body }); return { ok: true }; });
  const update = { update_id: 75, message: { chat: { id: 123, type: 'private' }, text: 'קפה 42 במזומן' } };
  const send = () => handler(request('/api/telegram', { method: 'POST', body: update, authorized: false, headers: { 'x-telegram-bot-api-secret-token': 'test-webhook' } }));
  const results = await Promise.all([send(), send()]);
  assert.ok(results.every(r => r.status === 200));
  const saved = (await store.getWithMetadata()).data;
  assert.equal(saved.transactions.filter(t => t.id === 'telegram-75').length, 1);
  assert.equal(replies.length, 1);
  assert.equal((await handler(request('/api/telegram', { method: 'POST', body: update, authorized: false }))).status, 401);
});
test('browser finance functions show correct balance with monthly debts and restore principal on deletion', async () => {
  const source = (await readFile(new URL('../app.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  const el = () => ({ addEventListener() {}, classList: { toggle() {} }, dataset: {}, style: {}, replaceChildren() {}, querySelector: el, append() {} });
  const context = vm.createContext({ structuredClone, cardGroups, commitmentAmount, mergeChanges, migrateLegacyPending, console, Date, Intl,
    crypto: globalThis.crypto, document: { querySelector: el, addEventListener() {}, createElement: el }, window: { addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, confirm: () => true });
  vm.runInContext(source.slice(0, source.indexOf("document.querySelector('#expense-form').addEventListener")), context);
  context.fixture = demoData();
  const result = vm.runInContext(`state = normalizeState(fixture); state.transactions[0].date = todayISO; render();
    const amount = getPendingCommitments().reduce((sum, item) => sum + commitmentAmount(item), 0);
    state.transactions.push({ id: 'paid', type: 'debt_payment', principal: 300, amount: 500, debtId: 'demo-loan', date: todayISO, method: 'bank' });
    state.debts[0].balance = 11700; deleteTransaction('paid');
    ({ amount, debt: state.debts[0].balance, balance: bankBalance() });`, context);
  assert.equal(result.amount, 1100); assert.equal(result.debt, 12000); assert.equal(result.balance, 15000);
});
