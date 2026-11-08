// Overlay UX fixes: paid-credit history + delete, negative balance styling, bank caption.
// Works with the existing app without replacing app.js.

const SNAPSHOT_KEY = 'simple-budget-sync-v3';

function money(amount) {
  if (!Number.isFinite(Number(amount))) return '—';
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Number(amount));
}

function dateLabel(value) {
  try {
    return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value || '';
  }
}

function readSnap() {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeSnap(snap) {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
}

function paintNegatives() {
  const snap = readSnap();
  if (!snap?.state) return;
  const settings = snap.state.settings || {};
  const openingDate = settings.openingDate || '';
  let bank = Number(settings.openingBankBalance) || 0;
  for (const item of snap.state.transactions || []) {
    if (item.date < openingDate) continue;
    if (item.type === 'income') bank += Number(item.amount) || 0;
    if (item.type === 'expense' && ['debit', 'bank'].includes(item.method)) bank -= Number(item.amount) || 0;
    if (item.type === 'debt_payment' && item.method !== 'cash') bank -= Number(item.amount) || 0;
    if (item.type === 'cash_withdrawal') bank -= Number(item.amount) || 0;
  }
  const paid = (snap.state.creditPayments || []).filter((p) => p.status === 'paid');
  for (const item of paid) {
    if (item.paidDate >= openingDate) bank -= Number(item.amount) || 0;
  }
  const bankEl = document.querySelector('#bank-now');
  const estEl = document.querySelector('#bank-estimate');
  if (bankEl) bankEl.classList.toggle('is-negative', bank < 0);
  if (estEl) estEl.classList.toggle('is-negative', bank < 0);

  const caption = document.querySelector('#bank-balance-caption');
  if (caption) {
    const parts = [];
    if (Number(settings.openingBankBalance) !== 0) parts.push(`פתיחה ${money(settings.openingBankBalance)}`);
    const paidSum = paid.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    if (paidSum > 0) parts.push(`${paid.length} חיובים ששולמו ־${money(paidSum)}`);
    caption.textContent = parts.length ? parts.join(' · ') : 'לפני חיובים עתידיים';
  }
}

function renderPaidCredits() {
  const holder = document.querySelector('#paid-credit-bills');
  if (!holder) return;
  const snap = readSnap();
  if (!snap?.state) {
    holder.innerHTML = '<div class="empty">אין נתונים עדיין.</div>';
    return;
  }
  const paid = (snap.state.creditPayments || [])
    .filter((item) => item.status === 'paid')
    .slice()
    .sort((a, b) => String(b.paidDate || '').localeCompare(String(a.paidDate || '')));
  holder.replaceChildren();
  if (!paid.length) {
    holder.innerHTML = '<div class="empty">אין חיובים שסומנו כששולמו. חיוב שסומן בטעות אפשר למחוק מכאן.</div>';
    return;
  }
  for (const item of paid) {
    const row = document.createElement('article');
    row.className = 'list-row';
    row.innerHTML =
      '<div class="row-info"><strong></strong><small></small></div><b class="is-negative"></b><button class="delete-button" type="button" aria-label="מחיקת חיוב ששולם">×</button>';
    row.querySelector('strong').textContent = 'חיוב אשראי ששולם';
    row.querySelector('small').textContent = `ירד ב־${dateLabel(item.paidDate || item.dueDate)}`;
    row.querySelector('b').textContent = `−${money(item.amount)}`;
    row.querySelector('button').addEventListener('click', () => {
      if (!confirm(`למחוק חיוב ששולם על סך ${money(item.amount)}? היתרה בבנק תתעדכן.`)) return;
      const current = readSnap();
      if (!current?.state) return;
      current.state.creditPayments = (current.state.creditPayments || []).filter((p) => p.id !== item.id);
      current.dirty = true;
      writeSnap(current);
      location.reload();
    });
    holder.append(row);
  }
}

let enhancing = false;
function enhance() {
  if (enhancing) return;
  enhancing = true;
  try {
    paintNegatives();
    renderPaidCredits();
  } finally {
    enhancing = false;
  }
}

// Do not observe the whole app — that caused an infinite loop freeze.
setTimeout(enhance, 600);
setTimeout(enhance, 1500);
setTimeout(enhance, 3000);
window.addEventListener('focus', () => setTimeout(enhance, 200));
