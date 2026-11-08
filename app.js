const API = '/api/budget';
const STORAGE_KEY = 'simple-budget-v2';
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
const today = new Date();
const todayISO = toISODate(today);

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
    || state.surplusActions.length || Number(state.settings?.openingBankBalance) !== 0
    || Boolean(state.telegramChatId)
    || Number(state.settings?.openingCashBalance) !== 0
    || state.settings?.openingDate !== todayISO
    || Object.values(state.settings?.budgets || {}).some(value => Number(value) !== 0)
    || Number(state.settings?.paydayDay) !== 10
    || Number(state.settings?.creditClosingDay) !== 15
    || Number(state.settings?.creditPaymentDay) !== 15;
}

function mergeList(primary, secondary) {
  const items = new Map();
  for (const item of [...(primary || []), ...(secondary || [])]) items.set(item.id, item);
  return [...items.values()];
}

function mergeStates(remote, local) {
  const merged = {
    ...remote,
    ...local,
    settings: hasData(local) ? local.settings : remote.settings,
    obligations: mergeList(remote.obligations, local.obligations),
    debts: mergeList(remote.debts, local.debts),
    deletedObligationIds: [...new Set([...(remote.deletedObligationIds || []), ...(local.deletedObligationIds || [])])].slice(-5_000),
    deletedDebtIds: [...new Set([...(remote.deletedDebtIds || []), ...(local.deletedDebtIds || [])])].slice(-5_000),
    transactions: mergeList(remote.transactions, local.transactions),
    deletedTransactionIds: [...new Set([...(remote.deletedTransactionIds || []), ...(local.deletedTransactionIds || [])])].slice(-5_000),
    creditPayments: mergeList(remote.creditPayments, local.creditPayments),
    surplusActions: mergeList(remote.surplusActions, local.surplusActions),
    processedTelegramUpdates: [...new Set([...(remote.processedTelegramUpdates || []), ...(local.processedTelegramUpdates || [])])].slice(-500),
    telegramChatId: remote.telegramChatId || local.telegramChatId || null,
  };
  const deleted = new Set(merged.deletedTransactionIds);
  merged.transactions = merged.transactions.filter(item => !deleted.has(item.id));
  const deletedObligations = new Set(merged.deletedObligationIds);
  const deletedDebts = new Set(merged.deletedDebtIds);
  merged.obligations = merged.obligations.filter(item => !deletedObligations.has(item.id));
  merged.debts = merged.debts.filter(item => !deletedDebts.has(item.id));
  return normalizeState(merged);
}

let state = normalizeState(readLocal());
let cloudActive = false;
const startupButtons = ['#add-expense', '#add-income', '#add-cash', '#manage-button', '#manage-button-secondary', '#settings-button', '#add-credit-bill', '#telegram-button'];
startupButtons.forEach(selector => { document.querySelector(selector).disabled = true; });

function readLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('simple-budget-v1') || 'null'); }
  catch { return null; }
}

function saveLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function setStatus(message) {
  document.querySelector('#sync-status').textContent = message;
}

async function saveState() {
  saveLocal();
  if (!cloudActive) {
    setStatus('השינוי נשמר במכשיר הזה; הענן עדיין לא מחובר');
    return;
  }
  setStatus('מסנכרן לענן…');
  try {
    const latestResponse = await fetch(API, { cache: 'no-store' });
    if (latestResponse.ok) state = mergeStates(normalizeState(await latestResponse.json()), state);
    const response = await fetch(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (!response.ok) throw new Error('sync failed');
    setStatus('מסונכרן לענן');
  } catch {
    setStatus('הסנכרון נכשל; השינוי נשמר במכשיר הזה');
  }
}

async function connectCloud() {
  try {
    const response = await fetch(API, { cache: 'no-store' });
    if (!response.ok) throw new Error('cloud unavailable');
    const remote = normalizeState(await response.json());
    const local = state;
    if (hasData(remote) && hasData(local)) state = mergeStates(remote, local);
    else if (hasData(remote)) state = remote;
    else if (hasData(local)) state = local;
    else state = remote;
    cloudActive = true;
    saveLocal();
    render();
    if (hasData(local) && !hasData(remote)) await saveState();
    else setStatus('מסונכרן לענן · האתר והנתונים פתוחים למי שיש לו את הקישור');
  } catch {
    cloudActive = false;
    setStatus('הענן לא זמין כרגע; אפשר להמשיך והמכשיר ישמור מקומית');
  } finally {
    startupButtons.forEach(selector => { document.querySelector(selector).disabled = false; });
  }
}

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
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Number(amount) || 0);
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
    ...state.debts.filter(item => Number(item.monthlyPayment) > 0).map(item => ({ ...item, kind: 'debt' })),
  ].filter(item => !paid.has(item.id)).map(item => ({
    ...item,
    dueDate: toISODate(dueDateForDay(item.dueDay, range)),
  })).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function getCardGroups() {
  const settledIds = new Set(state.creditPayments.flatMap(item => item.expenseIds || []));
  const groups = new Map();
  for (const item of state.transactions) {
    if (item.type !== 'expense' || item.method !== 'credit' || !item.creditDueDate || settledIds.has(item.id)) continue;
    const group = groups.get(item.creditDueDate) || { dueDate: item.creditDueDate, amount: 0, expenseIds: [], manual: false };
    group.amount += Number(item.amount) || 0;
    group.expenseIds.push(item.id);
    groups.set(item.creditDueDate, group);
  }
  for (const payment of state.creditPayments.filter(item => item.status === 'pending')) {
    const group = groups.get(payment.dueDate) || { dueDate: payment.dueDate, amount: 0, expenseIds: [], manual: false };
    group.amount = Number(payment.amount) || group.amount;
    group.manual = true;
    group.paymentId = payment.id;
    groups.set(payment.dueDate, group);
  }
  return [...groups.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

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

function render() {
  const range = cycleRange();
  const transactions = cycleTransactions(range);
  const expenses = transactions.filter(item => item.type === 'expense' && item.budgeted !== false);
  const totalBudget = Object.values(state.settings.budgets).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const spent = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const remaining = totalBudget - spent;
  const pending = getPendingCommitments(range);
  const pendingCards = getCardGroups();
  const bankNow = bankBalance();
  const cashNow = cashBalance();
  const bankCommitments = pending.filter(item => item.kind === 'debt' || item.method !== 'cash').reduce((sum, item) => sum + Number(item.amount), 0);
  const cashCommitments = pending.filter(item => item.kind === 'fixed' && item.method === 'cash').reduce((sum, item) => sum + Number(item.amount), 0);
  const cardCommitments = pendingCards.reduce((sum, item) => sum + Number(item.amount), 0)
    + state.creditPayments.filter(item => item.status === 'paid' && item.paidDate > todayISO).reduce((sum, item) => sum + Number(item.amount), 0);
  const bankAfterKnown = bankNow - bankCommitments - cardCommitments;
  const cashAfterKnown = cashNow - cashCommitments;
  const resourcesAfterKnown = bankAfterKnown + cashAfterKnown;
  const safeToSpend = Math.max(0, Math.min(remaining, resourcesAfterKnown));

  document.querySelector('#cycle-title').textContent = `מחזור ${dateLabel(toISODate(range.start), { day: 'numeric', month: 'long' })}–${dateLabel(toISODate(range.end), { day: 'numeric', month: 'long' })}`;
  document.querySelector('#cycle-remaining').textContent = money(remaining);
  document.querySelector('#budget-total').textContent = money(totalBudget);
  document.querySelector('#spent-total').textContent = money(spent);
  document.querySelector('#safe-to-spend').textContent = money(safeToSpend);
  document.querySelector('#bank-estimate').textContent = money(bankAfterKnown);
  document.querySelector('#bank-now').textContent = money(bankNow);
  document.querySelector('#cash-now').textContent = money(cashNow);
  document.querySelector('#next-payday').textContent = dateLabel(toISODate(new Date(range.end.getFullYear(), range.end.getMonth(), Number(state.settings.paydayDay) || 10)), { day: 'numeric', month: 'long' });
  document.querySelector('#credit-settings-caption').textContent = `סגירה ב־${state.settings.creditClosingDay} · חיוב ב־${state.settings.creditPaymentDay}`;
  document.querySelector('#progress').style.width = `${totalBudget > 0 ? Math.max(0, Math.min(100, spent / totalBudget * 100)) : 0}%`;
  document.querySelector('#cycle-remaining').dataset.value = String(remaining);
  document.querySelector('#bank-estimate').dataset.value = String(bankAfterKnown);
  document.querySelector('#sync-status').classList.toggle('warning', !cloudActive);

  renderBudgets(expenses);
  renderCommitments(pending, range);
  renderCards(getCardGroups());
  renderTransactions(transactions);
  renderSurplus(remaining, resourcesAfterKnown, range);
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
    row.querySelector('button').textContent = group.manual ? 'סמן כשולם' : 'עדכן / סמן כשולם';
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
    const type = item.type === 'income' ? 'הכנסה' : item.type === 'debt_payment' ? 'החזר חוב' : item.type === 'cash_withdrawal' ? 'משיכת מזומן' : (CATEGORIES[item.category] || 'הוצאה');
    const method = item.type === 'income' ? '' : METHODS[item.method] || '';
    const sign = item.type === 'income' || item.type === 'cash_withdrawal' ? '+' : '−';
    row.innerHTML = '<div class="row-info"><strong></strong><small></small></div><b></b><button class="delete-button" type="button" aria-label="מחיקת תנועה">×</button>';
    row.querySelector('strong').textContent = item.name;
    row.querySelector('small').textContent = `${type}${method ? ` · ${method}` : ''} · ${dateLabel(item.date)}`;
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
  form.querySelector('[name="date"]').value = todayISO;
  document.querySelector('#debt-payment-title').textContent = `החזר: ${item.name}`;
  document.querySelector('#debt-payment-dialog').showModal();
}

function openCreditPayment(group) {
  const form = document.querySelector('#credit-payment-form');
  form.dataset.dueDate = group.dueDate;
  form.dataset.manualId = group.paymentId || '';
  form.dataset.expenseIds = JSON.stringify(group.expenseIds || []);
  form.querySelector('[name="amount"]').value = Math.round(group.amount * 100) / 100;
  form.querySelector('[name="paidDate"]').value = todayISO;
  document.querySelector('#credit-payment-dialog').showModal();
}

function deleteTransaction(id) {
  if (!confirm('למחוק את התנועה הזאת?')) return;
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
  state.transactions.push({
    id: makeId(), type: 'debt_payment', name: debt.name, amount,
    method: 'bank', date: String(data.get('date')), debtId: debt.id,
    obligationId: debt.id, obligationCycleKey: form.dataset.cycleKey,
  });
  if (principal > 0) debt.balance = Math.max(0, Number(debt.balance) - principal);
  void saveState(); render(); renderTemplates();
  document.querySelector('#debt-payment-dialog').close();
});

document.querySelector('#credit-payment-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const manual = state.creditPayments.find(item => item.id === form.dataset.manualId);
  if (manual) {
    manual.status = 'paid';
    manual.amount = Number(data.get('amount'));
    manual.paidDate = String(data.get('paidDate'));
    manual.expenseIds = JSON.parse(form.dataset.expenseIds || '[]');
  } else {
    state.creditPayments.push({
      id: makeId(), dueDate: form.dataset.dueDate, amount: Number(data.get('amount')),
      paidDate: String(data.get('paidDate')), status: 'paid',
      expenseIds: JSON.parse(form.dataset.expenseIds || '[]'),
    });
  }
  void saveState(); render();
  document.querySelector('#credit-payment-dialog').close();
});

document.querySelector('#manual-credit-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.creditPayments.push({
    id: makeId(), dueDate: String(data.get('dueDate')), amount: Number(data.get('amount')),
    paidDate: '', status: 'pending', expenseIds: [], manual: true,
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
document.querySelector('#telegram-button').addEventListener('click', () => { document.querySelector('#telegram-result').textContent = ''; document.querySelector('#telegram-dialog').showModal(); });
document.querySelector('#telegram-setup-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('.save');
  const result = document.querySelector('#telegram-result');
  button.disabled = true;
  result.textContent = 'מחבר את הבוט…';
  try {
    const response = await fetch('/api/telegram/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: String(new FormData(form).get('code')) }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'החיבור נכשל');
    result.textContent = 'ה-webhook פעיל. עכשיו שלח לבוט בטלגרם: /pair ואותו קוד.';
  } catch (error) {
    result.textContent = error.message === 'Telegram setup is incomplete'
      ? 'חסרים משתני החיבור ב-Netlify. אחרי שמגדירים אותם, צריך לפרוס שוב ולנסות כאן.'
      : error.message || 'החיבור נכשל. בדוק את קוד החיבור ונסה שוב.';
  } finally {
    button.disabled = false;
  }
});
document.querySelector('#add-expense').addEventListener('click', () => { document.querySelector('#expense-form').elements.date.value = todayISO; document.querySelector('#expense-dialog').showModal(); });
document.querySelector('#add-income').addEventListener('click', () => { document.querySelector('#income-form').elements.date.value = todayISO; document.querySelector('#income-dialog').showModal(); });
document.querySelector('#add-cash').addEventListener('click', () => { document.querySelector('#cash-withdrawal-form').elements.date.value = todayISO; document.querySelector('#cash-withdrawal-dialog').showModal(); });
document.querySelector('#add-credit-bill').addEventListener('click', () => { document.querySelector('#manual-credit-form').elements.dueDate.value = todayISO; document.querySelector('#manual-credit-dialog').showModal(); });
document.querySelectorAll('[data-open-fixed]').forEach(button => button.addEventListener('click', () => document.querySelector('#fixed-dialog').showModal()));
document.querySelectorAll('[data-open-debt]').forEach(button => button.addEventListener('click', () => document.querySelector('#debt-dialog').showModal()));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(today);
render();
void connectCloud();
