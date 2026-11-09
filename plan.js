import { KEPT, LOCKED, previewSpend, summarize } from '/shared/plan.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '\u0026amp;', '<': '\u0026lt;', '>': '\u0026gt;', '"': '\u0026quot;', "'": '\u0026#39;' }[char]));
const shekel = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 });
const money = value => shekel.format(Number(value) || 0);
const todayISO = new Date().toLocaleDateString('en-CA');
const app = document.querySelector('#app');
const login = document.querySelector('#login');
let snapshot = null;
let revision = '';

function options(selected) {
  const choices = [['free', 'כסף חופשי'], ...KEPT.map(item => [item.id, item.name]), ...LOCKED.map(item => [item.id, item.name])];
  return choices.map(([id, name]) => `<option value="${escape(id)}"${id === selected ? ' selected' : ''}>${escape(name)}</option>`).join('');
}

function line(item, pot) {
  const width = item.budget > 0 ? Math.min(100, Math.round(item.used / item.budget * 100)) : 0;
  const potText = item.sink ? `<div class="meta">בקופה מחודשים קודמים ${money(pot || 0)}</div>` : '';
  return `<div class="line"><div class="row"><span class="name">${escape(item.name)}</span><b class="${item.left < 0 ? 'bad' : ''}">${money(item.left)}</b></div><div class="meta">${money(item.used)} מתוך ${money(item.budget)}</div><div class="tiny"><i class="${item.left < 0 ? 'over' : ''}" style="width:${width}%"></i></div>${potText}</div>`;
}

function render() {
  const view = summarize(snapshot.transactions || [], todayISO);
  const locked = view.lines.filter(item => LOCKED.some(entry => entry.id === item.id));
  const kept = view.lines.filter(item => KEPT.some(entry => entry.id === item.id));
  const total = view.lockedSum + view.keptSum + view.freeFull;
  document.querySelector('#banner').innerHTML = view.sunday ? '<div class="banner">היום יום ראשון. זה הערב של הבדיקה השבועית.</div>' : '';
  document.querySelector('#hero').innerHTML = `
    <div class="kicker">${view.started ? 'כסף חופשי שנשאר' : 'כסף חופשי שמתחיל מחר'}</div>
    <div class="amount ${view.freeLeft < 0 ? 'bad' : ''}">${money(view.freeLeft)}</div>
    <div class="sub">מתוך ${money(view.freeBudget)} במסגרת של ${money(12500)}. ${view.daysLeft} ימים עד סוף התקופה.</div>
    <div class="bar"><i style="width:${view.lockedSum / total * 100}%;background:#8b93a1"></i><i style="width:${view.keptSum / total * 100}%;background:#e4b56a"></i><i style="width:${view.freeFull / total * 100}%;background:#8dcea8"></i></div>
    <div class="legend"><span><i class="dot" style="background:#8b93a1"></i>מחויב ${money(view.lockedSum)}</span><span><i class="dot" style="background:#e4b56a"></i>לשמור ${money(view.keptSum)}</span><span><i class="dot" style="background:#8dcea8"></i>חופשי ${money(view.freeFull)}</span></div>
    <div class="stats"><div class="stat"><small>ליום</small><strong>${money(view.daily)}</strong></div><div class="stat"><small>לשבוע</small><strong>${money(view.weekly)}</strong></div><div class="stat"><small>רזרבה</small><strong>${money(view.reserve)}</strong></div></div>
    ${view.window.partial ? '<p class="note">בנובמבר המסגרת היא שני שלישים, מה־10 עד ה־30. החיובים הקבועים עצמם לא קטנים בבנק.</p>' : ''}
    ${view.over.length ? '<p class="note bad">יש חריגה בסעיף שמור. לא מורידים את זה אוטומטית מהחופשי.</p>' : ''}`;
  document.querySelector('#ask').innerHTML = `<h2>בא לי להוציא</h2><label>כמה זה יעלה?</label><input id="wish" inputmode="decimal" value="80" /><div id="answer"></div>`;
  document.querySelector('#wish').addEventListener('input', event => answer(view, event.target.value));
  answer(view, 80);
  document.querySelector('#kept').innerHTML = kept.map(item => line(item, view.pots[item.id])).join('');
  document.querySelector('#locked').innerHTML = locked.map(item => line(item, 0)).join('');
  document.querySelector('#rows').innerHTML = view.rows.length ? view.rows.map(item => `<div class="buy"><div><strong>${escape(item.name)}</strong><div class="meta">${escape(item.date)} · ${money(item.amount)}</div></div><select data-id="${escape(item.id)}">${options(item.plan)}</select></div>`).join('') : '<p class="note">עדיין אין הוצאות בתקופה הזו. מה שנרשם בתזרים או בטלגרם יופיע כאן.</p>';
  document.querySelectorAll('#rows select').forEach(select => select.addEventListener('change', () => savePlan(select.dataset.id, select.value)));
}

function answer(view, raw) {
  const result = previewSpend(view, raw);
  const text = !result.ok ? 'זה עובר את הכסף החופשי.' : result.heavy ? 'אפשר, אבל זה יותר מהקצב השבועי.' : 'זה נכנס לכסף החופשי.';
  document.querySelector('#answer').innerHTML = `<div class="check"><div class="row"><span>יישאר</span><strong class="${result.ok ? '' : 'bad'}">${money(result.after)}</strong></div><div class="meta">אחר כך בערך ${money(result.daily)} ליום. ${text}</div></div>`;
}

async function savePlan(id, plan) {
  const next = structuredClone(snapshot);
  const expense = next.transactions.find(item => item.id === id);
  if (!expense) return;
  expense.plan = plan;
  delete next._rev;
  const response = await fetch('/api/budget', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Budget-Revision': revision }, body: JSON.stringify(next) });
  if (!response.ok) { await load(); return; }
  snapshot = await response.json();
  revision = response.headers.get('x-budget-revision') || response.headers.get('etag') || snapshot._rev || '';
  render();
}

async function load() {
  const response = await fetch('/api/budget', { cache: 'no-store', credentials: 'same-origin' });
  if (response.status === 401) { login.hidden = false; app.hidden = true; return; }
  snapshot = await response.json();
  revision = response.headers.get('x-budget-revision') || response.headers.get('etag') || snapshot._rev || '';
  login.hidden = true;
  app.hidden = false;
  render();
}

login.addEventListener('submit', async event => {
  event.preventDefault();
  const response = await fetch('/api/session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: new FormData(login).get('key') }) });
  document.querySelector('#login-error').textContent = response.ok ? '' : 'המפתח לא מתאים.';
  if (response.ok) load();
});

load();
