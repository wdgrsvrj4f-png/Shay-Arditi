import { mergeChanges, migrateLegacyPending } from './shared/sync.js';
import { commitmentAmount, cardGroups } from './shared/budget.js';
const API = '/api/budget';
const STORAGE_KEY = 'simple-budget-v2';
const PENDING_SYNC_KEY = 'simple-budget-pending-sync-v1';
const CATEGORIES = {
  groceries: 'אוכל וקניות',
  fuel: 'דלק',
  transport: 'תחבורה',
  home: 'בית וחשבונות',
  health: 'בריאות',
  leisure: 'בילויים ואישי',
  other: 'אחר',
};
const METHODS = { debit: 'דיירקט', credit: 'אשראי', cash: 'מזומן', bank: 'העברה בנקאית' };
function currentDate() {
  const value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return new Date(`${value}T12:00:00`);
}
let today = currentDate();
let todayISO = toISODate(today);

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  return new Date(`${value}T12:00:00`);
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function blankState() {
  return {
    version: 2,
    settings: {
      paydayDay: 10,
      creditClosingDay: 15,
      creditPaymentDay: 15,
      openingDate: todayISO,
      openingBankBalance: 0,
      openingCashBalance: 0,
      budgets: Object.fromEntries(Object.keys(CATEGORIES).map(key => [key, 0])),
    },
    obligations: [],
    debts: [],
    deletedObligationIds: [],
    deletedDebtIds: [],
    transactions: [],
    deletedTransactionIds: [],
    creditPayments: [],
    surplusActions: [],
    processedTelegramUpdates: [],
    telegramChatId: null,
  };
}

function normalizeState(value) {
  const fresh = blankState();
  if (value?.version === 2) {
    return {
      ...fresh,
      ...value,
      settings: {
        ...fresh.settings,
        ...(value.settings || {}),
        budgets: { ...fresh.settings.budgets, ...(value.settings?.budgets || {}) },
      },
      obligations: Array.isArray(value.obligations) ? value.obligations : [],
      debts: Array.isArray(value.debts) ? value.debts : [],
      deletedObligationIds: Array.isArray(value.deletedObligationIds) ? value.deletedObligationIds : [],
      deletedDebtIds: Array.isArray(value.deletedDebtIds) ? value.deletedDebtIds : [],
      transactions: Array.isArray(value.transactions) ? value.transactions : [],
      deletedTransactionIds: Array.isArray(value.deletedTransactionIds) ? value.deletedTransactionIds : [],
      creditPayments: Array.isArray(value.creditPayments) ? value.creditPayments : [],
      surplusActions: Array.isArray(value.surplusActions) ? value.surplusActions : [],
      processedTelegramUpdates: Array.isArray(value.processedTelegramUpdates) ? value.processedTelegramUpdates.slice(-500) : [],
    };
  }

  // Keep any entries saved by the first version of the app.
  if (value?.months && typeof value.months === 'object') {
    const migrated = blankState();
    for (const [monthKey, month] of Object.entries(value.months)) {
      if (monthKey === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`) {
        migrated.settings.budgets.other = Number(month?.budget) || 0;
      }
      for (const item of Array.isArray(month?.expenses) ? month.expenses : []) {
        const created = new Date(Number(item.createdAt) || Date.now());
        migrated.transactions.push({
          id: String(item.id || makeId()),
          type: 'expense',
          name: String(item.name || 'הוצאה'),
          amount: Number(item.amount) || 0,
          category: 'other',
          method: 'debit',
          date: toISODate(created),
          budgeted: true,
        });
      }
    }
    return migrated;
  }
  return fresh;
}

function hasData(state) {
  return state.transactions.length || state.obligations.length || state.debts.length || state.creditPayments.length
    || state.surplusActions.length || state.deletedTransactionIds.length || state.deletedObligationIds.length || state.deletedDebtIds.length
    || Number(state.settings?.openingBankBalance) !== 0
    || Boolean(state.telegramChatId)
    || Number(state.settings?.openingCashBalance) !== 0
    || state.settings?.openingDate !== todayISO
    || Object.values(state.settings?.budgets || {}).some(value => Number(value) !== 0)
    || Number(state.settings?.paydayDay) !== 10
    || Number(state.settings?.creditClosingDay) !== 15
    || Number(state.settings?.creditPaymentDay) !== 15;
}

const SNAPSHOT_KEY = 'simple-budget-sync-v3';
const RECOVERY_KEY = 'simple-budget-recovery-v3';
let cached;
try { cached = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null'); } catch {}
let state = normalizeState(cached?.state || readLocal());
let baseState = cached?.base ? normalizeState(cached.base) : null;
let dirty = Boolean(cached?.dirty || needsCloudSync());
let cloudActive = false;
let unlocked = false;
let syncBusy = false;
let syncAgain = false;
let retryTimer = 0;
let conflictSnapshot = null;
function scheduleRetry(delay) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { retryTimer = 0; void refreshCloud(); }, delay);
}
const startupButtons = ['#add-expense', '#add-income', '#add-cash', '#manage-button', '#manage-button-secondary', '#settings-button', '#add-credit-bill'];
function setLocked(locked) {
  unlocked = !locked;
  document.querySelector('#budget-app').hidden = locked;
  document.querySelector('#login-panel').hidden = !locked;
  startupButtons.forEach(selector => { document.querySelector(selector).disabled = locked; });
}
function readLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('simple-budget-v1') || 'null'); }
  catch { return null; }
}
function saveLocal() {
  try {
    // State, merge base, and pending flag are one atomic localStorage write.
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ state, base: baseState, dirty }));
    localStorage.removeItem(PENDING_SYNC_KEY);
    return true;
  } catch {
    setStatus('אין מקום לשמירה במכשיר; השאר את הדף פתוח עד לסנכרון');
    return false;
  }
}
function needsCloudSync() {
  try { return localStorage.getItem(PENDING_SYNC_KEY) === '1'; } catch { return false; }
}
function setStatus(message) { document.querySelector('#sync-status').textContent = message; }
function backupLocal() {
  try { localStorage.setItem(RECOVERY_KEY, JSON.stringify({ state, base: baseState, savedAt: new Date().toISOString() })); return true; }
  catch { return false; }
}
function saveState() {
  dirty = true;
  saveLocal();
  if (!unlocked) return Promise.resolve();
  return refreshCloud();
}
function showConflict(remote) {
  conflictSnapshot = remote;
  document.querySelector('#conflict-panel').hidden = false;
  setStatus('אותו פרט שונה בשני מכשירים. בחר איזו גרסה לשמור.');
}
async function apiFetch(url, options = {}) {
  const response = await fetch(url, { ...options, cache: 'no-store', credentials: 'same-origin' });
  if (response.status === 401) {
    cloudActive = false;
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    setLocked(true);
    document.querySelector('#login-result').textContent = 'התחבר שוב כדי להמשיך. שינויים ממתינים נשמרו במכשיר.';
    throw new Error('נדרשת כניסה מחדש');
  }
  return response;
}
async function refreshCloud() {
  if (!unlocked) return;
  if (syncBusy) { syncAgain = true; return; }
  syncBusy = true;
  clearTimeout(retryTimer);
  retryTimer = 0;
  let retryDelay = 0;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      syncAgain = false;
      const response = await apiFetch(API);
      if (!response.ok) throw new Error('הענן לא זמין כרגע');
      const revision = response.headers.get('x-budget-revision') || response.headers.get('etag');
      if (!revision) throw new Error('גרסת השרת אינה תואמת. יש לרענן אחרי העדכון.');
      const raw = await response.json();
      const remote = normalizeState(raw);
      cloudActive = true;
      if (!baseState && !dirty && hasData(state) && raw?.version !== 2 && !hasData(remote)) dirty = true;
      if (!dirty) {
        state = remote; baseState = structuredClone(remote); saveLocal(); render();
        setStatus('מסונכרן');
        return;
      }
      // Different devices keep their own new entries. The same detail keeps whichever save landed last.
      const merged = baseState
        ? mergeChanges(baseState, state, remote, { preferLocal: true })
        : migrateLegacyPending(state, remote);
      state = normalizeState(merged.state);
      baseState = structuredClone(remote);
      if (JSON.stringify(state) === JSON.stringify(remote)) { dirty = false; saveLocal(); render(); setStatus('מסונכרן'); return; }
      saveLocal(); render();
      const submitted = structuredClone(state);
      setStatus('מסנכרן…');
      const saved = await apiFetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Budget-Revision': revision }, body: JSON.stringify(submitted) });
      if (saved.status === 409) continue;
      if (!saved.ok) throw new Error(saved.status === 413 ? 'התקציב גדול מדי לשמירה; הורד גיבוי לפני המשך' : 'השמירה לענן לא עברה, מנסה שוב');
      const acknowledged = normalizeState(await saved.json());
      const next = mergeChanges(submitted, state, acknowledged, { preferLocal: true });
      baseState = structuredClone(acknowledged);
      state = normalizeState(next.state);
      dirty = JSON.stringify(state) !== JSON.stringify(acknowledged);
      saveLocal(); render();
      if (!dirty && !syncAgain) { setStatus('מסונכרן'); return; }
    }
    retryDelay = 2000;
    setStatus('מסנכרן…');
  } catch (error) {
    cloudActive = false;
    setStatus(error.message === 'נדרשת כניסה מחדש' ? error.message : 'מסנכרן…');
    if (error.message !== 'נדרשת כניסה מחדש') retryDelay = 3000;
  } finally {
    syncBusy = false;
    if (syncAgain) { syncAgain = false; void refreshCloud(); }
    else if (retryDelay) scheduleRetry(retryDelay);
  }
}
async function connectCloud() {
  try {
    const response = await fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' });
    if (response.status === 503) {
      document.querySelector('#login-result').textContent = 'נדרשת הגדרת קוד כניסה בשרת לפני שאפשר לפתוח את התקציב.';
      return;
    }
    if (!response.ok) throw new Error();
    const session = await response.json();
    setLocked(!session.authenticated);
    if (session.authenticated) { render(); await refreshCloud(); }
  } catch { document.querySelector('#login-result').textContent = 'לא ניתן להתחבר כרגע. נסה שוב כשהחיבור חוזר.'; }
}
function refreshDate() {
  today = currentDate(); todayISO = toISODate(today);
  document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(today);
  if (unlocked) render();
}
window.addEventListener('focus', () => { refreshDate(); void refreshCloud(); });
window.addEventListener('online', () => { void refreshCloud(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshDate(); void refreshCloud(); } });
const poll = setInterval(() => { if (!document.hidden) void refreshCloud(); }, 12000);
poll.unref?.();
// Prevent a stale tab on the same device overwriting an unacknowledged edit.
window.addEventListener('storage', event => {
  if (event.key !== SNAPSHOT_KEY || !event.newValue || syncBusy || dirty) return;
  try { const value = JSON.parse(event.newValue); state = normalizeState(value.state); baseState = value.base; dirty = value.dirty; if (unlocked) render(); } catch {}
});

function cycleRange(date = today) {
  const day = Number(state.settings.paydayDay) || 10;
  let start = new Date(date.getFullYear(), date.getMonth(), day, 12);
  if (date.getDate() < day) start = new Date(date.getFullYear(), date.getMonth() - 1, day, 12);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, day - 1, 12);
  return { start, end, key: toISODate(start) };
}

function cycleForDate(value) {
  return cycleRange(parseDate(value)).key;
}

function dueDateForDay(day, range = cycleRange()) {
  const payday = Number(state.settings.paydayDay) || 10;
  const due = Number(day);
  const monthOffset = due < payday ? 1 : 0;
  const start = range.start;
  const lastDay = new Date(start.getFullYear(), start.getMonth() + monthOffset + 1, 0).getDate();
  return new Date(start.getFullYear(), start.getMonth() + monthOffset, Math.min(due, lastDay), 12);
}

function creditDueDate(purchaseDate) {
  const purchase = parseDate(purchaseDate);
  const closingDay = Number(state.settings.creditClosingDay) || 15;
  const paymentDay = Number(state.settings.creditPaymentDay) || 15;
  const daysThisMonth = new Date(purchase.getFullYear(), purchase.getMonth() + 1, 0).getDate();
  let close = new Date(purchase.getFullYear(), purchase.getMonth(), Math.min(closingDay, daysThisMonth), 12);
  if (purchase.getDate() > closingDay) {
    const nextMonthLength = new Date(purchase.getFullYear(), purchase.getMonth() + 2, 0).getDate();
    close = new Date(purchase.getFullYear(), purchase.getMonth() + 1, Math.min(closingDay, nextMonthLength), 12);
  }
  const paymentInCloseMonth = new Date(close.getFullYear(), close.getMonth(), Math.min(paymentDay, new Date(close.getFullYear(), close.getMonth() + 1, 0).getDate()), 12);
  if (paymentInCloseMonth > close) return toISODate(paymentInCloseMonth);
  const nextMonthLength = new Date(close.getFullYear(), close.getMonth() + 2, 0).getDate();
  return toISODate(new Date(close.getFullYear(), close.getMonth() + 1, Math.min(paymentDay, nextMonthLength), 12));
}

function money(amount) {
  if (!Number.isFinite(Number(amount))) return '—';
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Number(amount));
}

function dateLabel(value, options = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('he-IL', options).format(parseDate(value));
}

function cycleTransactions(range = cycleRange()) {
  return state.transactions.filter(item => item.date >= toISODate(range.start) && item.date <= toISODate(range.end));
}

function getPaidTemplateIds(range = cycleRange()) {
  const key = range.key;
  return new Set(state.transactions.filter(item => item.obligationCycleKey === key).map(item => item.obligationId).filter(Boolean));
}

function getPendingCommitments(range = cycleRange()) {
  const paid = getPaidTemplateIds(range);
  return [
    ...state.obligations.map(item => ({ ...item, kind: 'fixed' })),
    ...state.debts.filter(item => Number(item.monthlyPayment) > 0 && Number(item.balance) > 0).map(item => ({ ...item, kind: 'debt' })),
  ].filter(item => !paid.has(item.id)).map(item => ({
    ...item,
    dueDate: toISODate(dueDateForDay(item.dueDay, range)),
  })).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function getCardGroups() { return cardGroups(state); }

function bankBalance(asOf = todayISO) {
  const openingDate = state.settings.openingDate || todayISO;
  let balance = Number(state.settings.openingBankBalance) || 0;
  for (const item of state.transactions) {
    if (item.date < openingDate || item.date > asOf) continue;
    if (item.type === 'income') balance += Number(item.amount) || 0;
    if (item.type === 'expense' && ['debit', 'bank'].includes(item.method)) balance -= Number(item.amount) || 0;
    if (item.type === 'debt_payment' && item.method !== 'cash') balance -= Number(item.amount) || 0;
    if (item.type === 'cash_withdrawal') balance -= Number(item.amount) || 0;
  }
  for (const item of state.creditPayments) {
    if (item.status === 'paid' && item.paidDate >= openingDate && item.paidDate <= asOf) balance -= Number(item.amount) || 0;
  }
  return balance;
}

function cashBalance(asOf = todayISO) {
  const openingDate = state.settings.openingDate || todayISO;
  let balance = Number(state.settings.openingCashBalance) || 0;
  for (const item of state.transactions) {
    if (item.date < openingDate || item.date > asOf) continue;
    if (item.type === 'expense' && item.method === 'cash') balance -= Number(item.amount) || 0;
    if (item.type === 'debt_payment' && item.method === 'cash') balance -= Number(item.amount) || 0;
    if (item.type === 'cash_withdrawal') balance += Number(item.amount) || 0;
  }
  return balance;
}

function salaryPosition(range) {
  const tx = cycleTransactions(range);
  const income = tx.filter(item => item.type === 'income').reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const coveredByPendingBill = new Set(state.creditPayments.filter(item => item.status === 'pending').flatMap(item => item.coveredExpenseIds || []));
  const spentNow = tx.reduce((sum, item) => {
    if (item.type === 'cash_withdrawal') return sum + (Number(item.amount) || 0);
    if (item.type === 'debt_payment' && item.method !== 'cash') return sum + (Number(item.amount) || 0);
    if (item.type === 'expense' && item.method !== 'cash' && !coveredByPendingBill.has(item.id)) return sum + (Number(item.amount) || 0);
    return sum;
  }, 0);
  const reserved = getPendingCommitments(range)
    .filter(item => item.kind === 'debt' || item.method !== 'cash')
    .reduce((sum, item) => sum + commitmentAmount(item), 0);
  const pendingCredit = state.creditPayments
    .filter(item => item.status === 'pending')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const spent = spentNow + reserved + pendingCredit;
  return { income, spent, left: income - spent };
}

function render() {
  const range = cycleRange();
  const transactions = cycleTransactions(range);
  const expenses = transactions.filter(item => item.type === 'expense' && item.budgeted !== false);
  const totalBudget = Object.values(state.settings.budgets).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const spent = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const remaining = totalBudget - spent;
  const pending = getPendingCommitments(range);
  const pendingCards = getCardGroups();
  const position = salaryPosition(range);
  document.querySelector('#cycle-title').textContent = `מחזור ${dateLabel(toISODate(range.start), { day: 'numeric', month: 'long' })}–${dateLabel(toISODate(range.end), { day: 'numeric', month: 'long' })}`;
  const freeEl = document.querySelector('#free-to-spend');
  freeEl.textContent = money(position.left);
  freeEl.classList.toggle('is-negative', position.left < 0);
  document.querySelector('#salary-income').textContent = money(position.income);
  document.querySelector('#salary-spent').textContent = money(position.spent);
  const note = document.querySelector('#salary-note');
  note.textContent = position.income > 0
    ? 'המספר אומר אם נשארת בתוך המשכורת. מזומן שהיה עליך קודם לא מוריד אותו.'
    : 'עוד אין משכורת במחזור הזה. אחרי שתוסיף אותה, תראה מה נשאר.';

  document.querySelector('#cycle-remaining').textContent = money(remaining);
  document.querySelector('#budget-total').textContent = money(totalBudget);
  document.querySelector('#spent-total').textContent = money(spent);
  document.querySelector('#bank-estimate').textContent = money(bankBalance());
  document.querySelector('#bank-now').textContent = money(bankBalance());
  document.querySelector('#cash-now').textContent = money(cashBalance());
  document.querySelector('#next-payday').textContent = dateLabel(toISODate(new Date(range.end.getFullYear(), range.end.getMonth(), Number(state.settings.paydayDay) || 10)), { day: 'numeric', month: 'long' });
  document.querySelector('#credit-settings-caption').textContent = `סגירה ב־${state.settings.creditClosingDay} · חיוב ב־${state.settings.creditPaymentDay}`;
  const bar = document.querySelector('#salary-bar');
  const ratio = position.income > 0 ? Math.max(0, Math.min(1, position.left / position.income)) : 0;
  if (bar) bar.style.width = `${ratio * 100}%`;
  document.querySelector('#cycle-remaining').dataset.value = String(remaining);
  document.querySelector('#sync-status').classList.toggle('warning', !cloudActive);

  renderBudgets(expenses);
  renderCommitments(pending, range);
  renderCards(getCardGroups());
  renderTransactions(transactions);
  renderSurplus(position.left, position.left, range);
}

function renderBudgets(expenses) {
  const holder = document.querySelector('#category-budgets');
  holder.replaceChildren();
  for (const [key, label] of Object.entries(CATEGORIES)) {
    const limit = Number(state.settings.budgets[key]) || 0;
    const amount = expenses.filter(item => item.category === key).reduce((sum, item) => sum + Number(item.amount), 0);
    const left = limit - amount;
    const card = document.createElement('div');
    card.className = 'category-card';
    card.innerHTML = '<div class="category-top"><strong></strong><span></span></div><div class="tiny-bar"><i></i></div><small></small>';
    card.querySelector('strong').textContent = label;
    card.querySelector('span').textContent = `${money(amount)} / ${money(limit)}`;
    card.querySelector('i').style.width = `${limit > 0 ? Math.max(0, Math.min(100, amount / limit * 100)) : 0}%`;
    card.querySelector('small').textContent = limit > 0 ? (left >= 0 ? `נשארו ${money(left)}` : `חריגה של ${money(Math.abs(left))}`) : 'הגדר יעד בהגדרות';
    holder.append(card);
  }
}

function renderCommitments(items, range) {
  const holder = document.querySelector('#commitments');
  holder.replaceChildren();
  if (!items.length) {
    holder.innerHTML = '<div class="empty">אין התחייבויות לתשלום במחזור הזה. אפשר להוסיף קבועות או החזרי חוב.</div>';
    return;
  }
  for (const item of items) {
    const row = document.createElement('article');
    row.className = 'list-row';
    row.innerHTML = '<div class="row-info"><strong></strong><small></small></div><b></b><button class="small-button" type="button">סמן כשולם</button>';
    row.querySelector('strong').textContent = item.name;
    row.querySelector('small').textContent = `${item.kind === 'debt' ? 'החזר חוב' : CATEGORIES[item.category] || 'קבועה'} · ${dateLabel(item.dueDate)} · ${item.kind === 'debt' ? 'העברה/דיירקט' : METHODS[item.method]}`;
    row.querySelector('b').textContent = money(item.kind === 'debt' ? item.monthlyPayment : item.amount);
    row.querySelector('button').addEventListener('click', () => item.kind === 'debt' ? openDebtPayment(item, range) : payFixed(item, range));
    holder.append(row);
  }
}

function renderCards(groups) {
  const holder = document.querySelector('#credit-bills');
  holder.replaceChildren();
  if (!groups.length) {
    holder.innerHTML = '<div class="empty">אין חיובי אשראי עתידיים שנרשמו. חיובים ישנים אפשר להזין ידנית.</div>';
    return;
  }
  for (const group of groups) {
    const row = document.createElement('article');
    row.className = 'list-row';
    row.innerHTML = '<div class="row-info"><strong></strong><small></small></div><b></b><button class="small-button" type="button"></button>';
    row.querySelector('strong').textContent = group.manual ? 'חיוב אשראי שהוזן' : 'חיוב אשראי משוער';
    row.querySelector('small').textContent = `צפוי ב־${dateLabel(group.dueDate)}`;
    row.querySelector('b').textContent = money(group.amount);
    row.querySelector('button').textContent = 'עדכן / סמן כשולם';
    row.querySelector('button').addEventListener('click', () => openCreditPayment(group));
    holder.append(row);
  }
}

function renderTransactions(transactions) {
  const holder = document.querySelector('#transactions');
  holder.replaceChildren();
  const rows = transactions.filter(item => ['expense', 'income', 'debt_payment', 'cash_withdrawal'].includes(item.type)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  if (!rows.length) {
    holder.innerHTML = '<div class="empty">עוד אין תנועות במחזור. הוסף משכורת או הוצאה כדי להתחיל.</div>';
    return;
  }
  for (const item of rows) {
    const row = document.createElement('article');
    row.className = 'list-row transaction-row';
    const offSalary = item.type === 'expense' && item.method === 'cash';
    const type = item.type === 'income' ? 'הכנסה' : item.type === 'debt_payment' ? 'החזר חוב' : item.type === 'cash_withdrawal' ? 'משיכת מזומן' : (CATEGORIES[item.category] || 'הוצאה');
    const method = item.type === 'income' ? '' : METHODS[item.method] || '';
    const sign = item.type === 'income' ? '+' : offSalary ? '' : '−';
    row.innerHTML = '<div class="row-info"><strong></strong><small></small></div><b></b><button class="delete-button" type="button" aria-label="מחיקת תנועה">×</button>';
    row.querySelector('strong').textContent = item.name;
    row.querySelector('small').textContent = `${type}${method ? ` · ${method}` : ''}${offSalary ? ' · לא מהמשכורת' : ''} · ${dateLabel(item.date)}`;
    row.querySelector('b').textContent = `${sign}${money(item.amount)}`;
    row.querySelector('button').addEventListener('click', () => deleteTransaction(item.id));
    holder.append(row);
  }
}

function renderSurplus(remaining, bankAfterKnown, range) {
  const paidAllocations = state.surplusActions.filter(item => item.cycleKey === range.key).reduce((sum, item) => sum + Number(item.amount), 0);
  const available = Math.max(0, Math.min(remaining, bankAfterKnown) - paidAllocations);
  document.querySelector('#surplus-amount').textContent = money(available);
  document.querySelector('#surplus-amount').dataset.value = String(available);
  document.querySelector('#surplus-note').textContent = available > 0
    ? 'עודף משוער אחרי חיובים ידועים. רישום יעד אינו מעביר כסף בפועל.'
    : 'עודף אמיתי יופיע רק אחרי ששומרים כסף לחשבונות ולחיובי אשראי שעוד לא ירדו.';
  document.querySelector('#allocate-surplus').disabled = available <= 0;
  document.querySelector('#surplus-history').textContent = paidAllocations > 0 ? `כבר שויכו במחזור הזה ${money(paidAllocations)} ליעדים.` : '';
}

function addTransaction(transaction) {
  state.transactions.push({ id: makeId(), ...transaction });
  void saveState();
  render();
}

function payFixed(item, range) {
  const date = todayISO;
  addTransaction({
    type: 'expense', name: item.name, amount: Number(item.amount), category: item.category || 'other',
    method: item.method || 'debit', date, budgeted: false,
    creditDueDate: item.method === 'credit' ? creditDueDate(date) : undefined,
    obligationId: item.id, obligationCycleKey: range.key,
  });
}

function openDebtPayment(item, range) {
  const form = document.querySelector('#debt-payment-form');
  form.dataset.debtId = item.id;
  form.dataset.cycleKey = range.key;
  form.querySelector('[name="amount"]').value = item.monthlyPayment;
  form.querySelector('[name="principal"]').value = '';
  form.querySelector('[name="principal"]').max = item.monthlyPayment;
  form.querySelector('[name="date"]').value = todayISO;
  document.querySelector('#debt-payment-title').textContent = `החזר: ${item.name}`;
  document.querySelector('#debt-payment-dialog').showModal();
}

function openCreditPayment(group) {
  const form = document.querySelector('#credit-payment-form');
  form.dataset.dueDate = group.dueDate;
  form.dataset.paymentIds = JSON.stringify(group.paymentIds || []);
  form.dataset.expenseIds = JSON.stringify(group.expenseIds || []);
  form.querySelector('[name="amount"]').value = Math.round(group.amount * 100) / 100;
  form.querySelector('[name="paidDate"]').value = todayISO;
  form.elements.status.value = 'paid';
  form.elements.paidDate.disabled = false;
  form.elements.paidDate.required = true;
  document.querySelector('#credit-payment-dialog').showModal();
}

function deleteTransaction(id) {
  const removed = state.transactions.find(item => item.id === id);
  const message = removed?.type === 'debt_payment' && removed.principal === undefined
    ? 'בתשלום ישן זה לא נשמר חלק הקרן. מחיקתו לא תשחזר את יתרת החוב; יהיה צורך לעדכן אותה בנפרד. למחוק?'
    : 'למחוק את התנועה הזאת?';
  if (!confirm(message)) return;
  if (removed?.type === 'debt_payment' && Number(removed.principal) > 0) {
    const debt = state.debts.find(item => item.id === removed.debtId);
    if (debt) debt.balance = Number(debt.balance) + Number(removed.principal);
  }
  state.transactions = state.transactions.filter(item => item.id !== id);
  state.deletedTransactionIds = [...new Set([...(state.deletedTransactionIds || []), id])].slice(-5_000);
  void saveState();
  render();
}

function populateSettings() {
  const form = document.querySelector('#settings-form');
  for (const key of ['paydayDay', 'creditClosingDay', 'creditPaymentDay', 'openingDate', 'openingBankBalance', 'openingCashBalance']) {
    form.elements[key].value = state.settings[key];
  }
  for (const key of Object.keys(CATEGORIES)) form.elements[`budget-${key}`].value = state.settings.budgets[key] || 0;
}

function renderTemplates() {
  const holder = document.querySelector('#template-list');
  holder.replaceChildren();
  const all = [
    ...state.obligations.map(item => ({ ...item, kind: 'fixed' })),
    ...state.debts.map(item => ({ ...item, kind: 'debt' })),
  ];
  if (!all.length) holder.innerHTML = '<div class="empty">עדיין לא הוגדרו תשלומים קבועים או חובות.</div>';
  for (const item of all) {
    const row = document.createElement('article');
    row.className = 'list-row';
    row.innerHTML = '<div class="row-info"><strong></strong><small></small></div><b></b><button class="delete-button" type="button" aria-label="מחיקת התחייבות">×</button>';
    row.querySelector('strong').textContent = item.name;
    row.querySelector('small').textContent = item.kind === 'debt'
      ? `חוב: ${money(item.balance)} · תשלום ביום ${item.dueDay}`
      : `קבועה · ${CATEGORIES[item.category] || 'אחר'} · יום ${item.dueDay} · ${METHODS[item.method]}`;
    row.querySelector('b').textContent = money(item.kind === 'debt' ? item.monthlyPayment : item.amount);
    row.querySelector('button').addEventListener('click', () => {
      if (!confirm(`למחוק את ${item.name} מהתשלומים הקבועים?`)) return;
      if (item.kind === 'debt') {
        state.debts = state.debts.filter(value => value.id !== item.id);
        state.deletedDebtIds = [...new Set([...(state.deletedDebtIds || []), item.id])].slice(-5_000);
      } else {
        state.obligations = state.obligations.filter(value => value.id !== item.id);
        state.deletedObligationIds = [...new Set([...(state.deletedObligationIds || []), item.id])].slice(-5_000);
      }
      void saveState(); renderTemplates(); render();
    });
    holder.append(row);
  }
}

document.querySelector('#expense-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const method = String(data.get('method'));
  const date = String(data.get('date'));
  addTransaction({
    type: 'expense', name: String(data.get('name')).trim(), amount: Number(data.get('amount')),
    category: String(data.get('category')), method, date, budgeted: true,
    creditDueDate: method === 'credit' ? creditDueDate(date) : undefined,
  });
  event.currentTarget.reset();
  document.querySelector('#expense-dialog').close();
});

document.querySelector('#income-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  addTransaction({ type: 'income', name: String(data.get('name')).trim() || 'משכורת', amount: Number(data.get('amount')), date: String(data.get('date')) });
  event.currentTarget.reset();
  document.querySelector('#income-dialog').close();
});

document.querySelector('#fixed-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.obligations.push({
    id: makeId(), name: String(data.get('name')).trim(), amount: Number(data.get('amount')),
    category: String(data.get('category')), method: String(data.get('method')), dueDay: Number(data.get('dueDay')),
  });
  void saveState(); render(); renderTemplates();
  event.currentTarget.reset();
  document.querySelector('#fixed-dialog').close();
});

document.querySelector('#debt-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.debts.push({
    id: makeId(), name: String(data.get('name')).trim(), balance: Number(data.get('balance')),
    monthlyPayment: Number(data.get('monthlyPayment')), dueDay: Number(data.get('dueDay')),
  });
  void saveState(); render(); renderTemplates();
  event.currentTarget.reset();
  document.querySelector('#debt-dialog').close();
});

document.querySelector('#debt-payment-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const debt = state.debts.find(item => item.id === form.dataset.debtId);
  if (!debt) return;
  const amount = Number(data.get('amount'));
  const principal = Number(data.get('principal')) || 0;
  if (principal > amount || principal > Number(debt.balance)) { alert('חלק הקרן לא יכול להיות גדול מהתשלום או מיתרת החוב.'); return; }
  state.transactions.push({
    id: makeId(), type: 'debt_payment', name: debt.name, amount,
    method: 'bank', date: String(data.get('date')), debtId: debt.id, principal,
    obligationId: debt.id, obligationCycleKey: form.dataset.cycleKey,
  });
  if (principal > 0) debt.balance = Math.max(0, Number(debt.balance) - principal);
  void saveState(); render(); renderTemplates();
  document.querySelector('#debt-payment-dialog').close();
});

document.querySelector('#credit-payment-form').elements.status.addEventListener('change', event => {
  const form = document.querySelector('#credit-payment-form');
  form.elements.paidDate.disabled = event.target.value !== 'paid';
  form.elements.paidDate.required = event.target.value === 'paid';
});

document.querySelector('#credit-payment-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const paymentIds = JSON.parse(form.dataset.paymentIds || '[]');
  state.creditPayments = state.creditPayments.filter(item => !paymentIds.includes(item.id));
  state.creditPayments.push({
    id: makeId(), dueDate: form.dataset.dueDate, amount: Number(data.get('amount')),
    paidDate: data.get('status') === 'paid' ? String(data.get('paidDate')) : '', status: String(data.get('status')),
    expenseIds: data.get('status') === 'paid' ? JSON.parse(form.dataset.expenseIds || '[]') : [],
    amountMode: 'statement', coveredExpenseIds: JSON.parse(form.dataset.expenseIds || '[]'),
  });
  void saveState(); render();
  document.querySelector('#credit-payment-dialog').close();
});

document.querySelector('#manual-credit-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const dueDate = String(data.get('dueDate'));
  const amountMode = String(data.get('amountMode') || 'remainder');
  const pending = state.creditPayments.filter(item => item.status === 'pending' && item.dueDate === dueDate);
  if (pending.length && (amountMode === 'statement' || pending.some(item => item.amountMode === 'statement'))) {
    alert('כבר קיים חיוב למועד הזה. כדי לעדכן את הסכום הכולל, השתמש בעדכון החשבון הקיים.'); return;
  }
  const coveredExpenseIds = amountMode === 'statement' ? getCardGroups().find(group => group.dueDate === dueDate)?.expenseIds || [] : [];
  state.creditPayments.push({
    id: makeId(), dueDate, amount: Number(data.get('amount')),
    paidDate: '', status: 'pending', expenseIds: [], manual: true, amountMode, coveredExpenseIds,
  });
  void saveState(); render();
  event.currentTarget.reset();
  document.querySelector('#manual-credit-dialog').close();
});

document.querySelector('#cash-withdrawal-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  addTransaction({ type: 'cash_withdrawal', name: 'משיכת מזומן', amount: Number(data.get('amount')), date: String(data.get('date')) });
  event.currentTarget.reset();
  document.querySelector('#cash-withdrawal-dialog').close();
});

document.querySelector('#settings-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  state.settings.paydayDay = Number(form.elements.paydayDay.value);
  state.settings.creditClosingDay = Number(form.elements.creditClosingDay.value);
  state.settings.creditPaymentDay = Number(form.elements.creditPaymentDay.value);
  state.settings.openingDate = form.elements.openingDate.value;
  state.settings.openingBankBalance = Number(form.elements.openingBankBalance.value);
  state.settings.openingCashBalance = Number(form.elements.openingCashBalance.value);
  for (const key of Object.keys(CATEGORIES)) state.settings.budgets[key] = Number(form.elements[`budget-${key}`].value) || 0;
  void saveState(); render();
  document.querySelector('#settings-dialog').close();
});

document.querySelector('#surplus-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const limit = Number(document.querySelector('#surplus-amount').dataset.value || 0);
  const amount = Number(data.get('amount'));
  if (!Number.isFinite(amount) || amount <= 0 || amount > limit) {
    event.currentTarget.elements.amount.setCustomValidity(`אפשר לשייך עד ${Math.floor(limit)} ₪`);
    event.currentTarget.elements.amount.reportValidity();
    return;
  }
  event.currentTarget.elements.amount.setCustomValidity('');
  state.surplusActions.push({
    id: makeId(), cycleKey: cycleRange().key, amount,
    destination: String(data.get('destination')), note: String(data.get('note') || '').trim(), date: todayISO,
  });
  void saveState(); render();
  event.currentTarget.reset();
  document.querySelector('#surplus-dialog').close();
});

document.querySelector('#allocate-surplus').addEventListener('click', () => {
  const available = Math.max(0, Number(document.querySelector('#surplus-amount').dataset.value || 0));
  document.querySelector('#surplus-form').elements.amount.max = String(Math.floor(available));
  document.querySelector('#surplus-form').elements.amount.value = Math.floor(available);
  document.querySelector('#surplus-dialog').showModal();
});

document.querySelector('#settings-button').addEventListener('click', () => { populateSettings(); document.querySelector('#settings-dialog').showModal(); });
document.querySelector('#manage-button').addEventListener('click', () => { renderTemplates(); document.querySelector('#manage-dialog').showModal(); });
document.querySelector('#manage-button-secondary').addEventListener('click', () => { renderTemplates(); document.querySelector('#manage-dialog').showModal(); });
document.querySelector('#add-expense').addEventListener('click', () => { document.querySelector('#expense-form').elements.date.value = todayISO; document.querySelector('#expense-dialog').showModal(); });
document.querySelector('#add-income').addEventListener('click', () => { document.querySelector('#income-form').elements.date.value = todayISO; document.querySelector('#income-dialog').showModal(); });
document.querySelector('#add-cash').addEventListener('click', () => { document.querySelector('#cash-withdrawal-form').elements.date.value = todayISO; document.querySelector('#cash-withdrawal-dialog').showModal(); });
document.querySelector('#add-credit-bill').addEventListener('click', () => { document.querySelector('#manual-credit-form').elements.dueDate.value = todayISO; document.querySelector('#manual-credit-dialog').showModal(); });
document.querySelectorAll('[data-open-fixed]').forEach(button => button.addEventListener('click', () => document.querySelector('#fixed-dialog').showModal()));
document.querySelectorAll('[data-open-debt]').forEach(button => button.addEventListener('click', () => document.querySelector('#debt-dialog').showModal()));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

document.querySelector('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button'); button.disabled = true;
  const result = document.querySelector('#login-result');
  try {
    const response = await fetch('/api/session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: form.elements.key.value }) });
    if (!response.ok) throw new Error(response.status === 503 ? 'נדרשת הגדרת קוד כניסה בשרת.' : 'קוד הכניסה שגוי.');
    form.reset(); result.textContent = ''; setLocked(false); render(); await refreshCloud();
  } catch (error) { result.textContent = error.message || 'החיבור נכשל.'; }
  finally { button.disabled = false; }
});
document.querySelector('#logout-button').addEventListener('click', async () => {
  if (dirty && !confirm('יש שינויים שעדיין לא סונכרנו. הם יישמרו במכשיר לכניסה הבאה. לצאת?')) return;
  const response = await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
  if (!response?.ok) { setStatus('היציאה נכשלה. נסה שוב כשהחיבור חוזר.'); return; }
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  cloudActive = false; setLocked(true);
});
document.querySelector('#conflict-local').addEventListener('click', () => {
  if (!conflictSnapshot) return;
  if (!backupLocal()) { setStatus('לא ניתן לשמור גיבוי מקומי. הורד גיבוי לפני בחירת גרסה.'); return; }
  const remote = conflictSnapshot;
  state = normalizeState(mergeChanges(baseState || { ...remote, settings: {}, obligations: [], debts: [], transactions: [], creditPayments: [], surplusActions: [] }, state, remote, { preferLocal: true }).state);
  baseState = structuredClone(remote); conflictSnapshot = null; dirty = true;
  document.querySelector('#conflict-panel').hidden = true; saveLocal(); render(); void refreshCloud();
});
document.querySelector('#conflict-cloud').addEventListener('click', () => {
  if (!conflictSnapshot) return;
  if (!backupLocal()) { setStatus('לא ניתן לשמור גיבוי מקומי. הורד גיבוי לפני בחירת גרסה.'); return; }
  const remote = conflictSnapshot;
  // Keep unrelated local edits; only conflicting fields use the cloud value.
  state = normalizeState(baseState ? mergeChanges(baseState, state, remote).state : migrateLegacyPending(state, remote).state);
  baseState = structuredClone(remote); conflictSnapshot = null; dirty = true;
  document.querySelector('#conflict-panel').hidden = true; saveLocal(); render(); void refreshCloud();
});
document.querySelector('#export-budget').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ state, base: baseState, dirty }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `budget-backup-${todayISO}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
setLocked(true);
refreshDate();
void connectCloud();
