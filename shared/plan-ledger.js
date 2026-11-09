// Budget ledger: proposed monthly allocations are not bank transfers.
// All values are ILS and rounded to agorot. A fund is spendable only after
// its deposit was explicitly confirmed by the user.
import { INCOME, KEPT, LOCKED, classifyExpense, money, planWindow, sum } from './plan.js';

export const FUND_IDS = ['reserve', ...KEPT.filter(item => item.sink).map(item => item.id)];
export const MOVEABLE_IDS = ['free', ...KEPT.map(item => item.id)];
export const TARGET_IDS = [...MOVEABLE_IDS, ...LOCKED.map(item => item.id)];
const ids = new Set(MOVEABLE_IDS);
const targets = new Set(TARGET_IDS);
const fundIds = new Set(FUND_IDS);

export function monthOf(date) { return String(date || '').slice(0, 7); }
export function dateAtEnd(month) {
  const [year, index] = month.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(index) || index < 1 || index > 12) return '';
  return planWindow(year, index).end;
}
const safeEvents = state => {
  const all = Array.isArray(state?.planEvents) ? state.planEvents : [];
  const reversed = new Set(all.filter(item => item.kind === 'fundUseReversal').map(item => item.fundUseId));
  return all.filter(item => !reversed.has(item.id));
};
const safeTransactions = state => Array.isArray(state?.transactions) ? state.transactions : [];

export function balancesFromDeposits(state) {
  const balances = Object.fromEntries(FUND_IDS.map(id => [id, 0]));
  const awaitingDeposit = Object.fromEntries(FUND_IDS.map(id => [id, 0]));
  const confirmed = new Set(safeEvents(state).filter(entry => entry.kind === 'depositConfirmed').map(entry => entry.closeId));
  for (const entry of safeEvents(state)) {
    if (entry.kind !== 'close') continue;
    const target = confirmed.has(entry.id) ? balances : awaitingDeposit;
    for (const [id, value] of Object.entries(entry.allocations || {})) {
      if (fundIds.has(id)) target[id] = money(target[id] + Number(value || 0));
    }
  }
  for (const entry of safeEvents(state)) {
    if (entry.kind === 'salaryExcess') balances.reserve = money(balances.reserve + Number(entry.amount || 0));
    if (entry.kind === 'reserveTopUp') balances.reserve = money(balances.reserve - Number(entry.amount || 0));
    if (entry.kind === 'fundOpening' && fundIds.has(entry.fundId)) {
      balances[entry.fundId] = money(balances[entry.fundId] + Number(entry.amount || 0));
    }
    if (entry.kind === 'fundUse' && fundIds.has(entry.fundId)) {
      balances[entry.fundId] = money(balances[entry.fundId] - Number(entry.amount || 0));
    }
    if (entry.kind === 'fundMove' && fundIds.has(entry.from) && fundIds.has(entry.to)) {
      balances[entry.from] = money(balances[entry.from] - Number(entry.amount || 0));
      balances[entry.to] = money(balances[entry.to] + Number(entry.amount || 0));
    }
  }
  return { balances, awaitingDeposit };
}

export function fundingStatus(state, year, month) {
  // A calendar month's budget is financed by the preceding month's salary.
  const prev = new Date(Date.UTC(year, month - 2, 1));
  const salaryMonth = [prev.getUTCFullYear(), String(prev.getUTCMonth() + 1).padStart(2, '0')].join('-');
  const salaryRows = safeTransactions(state).filter(tx => tx.type === 'income'
    && monthOf(tx.date) === salaryMonth && /משכורת|שכר עבודה|salary|paycheck/i.test(String(tx.name || '')));
  const found = salaryRows.length > 0;
  const received = money(sum(salaryRows));
  const target = [year, String(month).padStart(2, '0')].join('-');
  const toppedUp = money(safeEvents(state).filter(item => item.kind === 'reserveTopUp' && item.budgetMonth === target).reduce((total, item) => total + Number(item.amount), 0));
  const movedExcess = money(safeEvents(state).filter(item => item.kind === 'salaryExcess' && item.budgetMonth === target).reduce((total, item) => total + Number(item.amount), 0));
  const shortfall = found ? Math.max(0, money(INCOME - received)) : 0;
  const surplus = found ? Math.max(0, money(received - INCOME)) : 0;
  return { found, salaryMonth, received, shortfall, surplus, toppedUp,
    uncovered: money(Math.max(0, shortfall - toppedUp)),
    excessToDeposit: money(Math.max(0, surplus - movedExcess)) };
}

export function monthView(state, year, month) {
  const window = planWindow(year, month);
  const monthKey = window.start.slice(0, 7);
  const fundedExpenseIds = new Set(safeEvents(state).filter(entry => entry.kind === 'fundUse').map(entry => entry.expenseId));
  const rows = [];
  const spent = {};
  for (const item of safeTransactions(state)) {
    if (item?.type !== 'expense' || item.date < window.start || item.date > window.end) continue;
    const fundPaid = fundedExpenseIds.has(item.id);
    const plan = classifyExpense(item);
    rows.push({ id: item.id, name: item.name, amount: money(item.amount), date: item.date, method: item.method, plan, fundPaid });
    if (!fundPaid) spent[plan] = money((spent[plan] || 0) + Number(item.amount || 0));
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  const shifts = Object.fromEntries(TARGET_IDS.map(id => [id, 0]));
  for (const entry of safeEvents(state)) {
    if (entry.kind !== 'transfer' || monthOf(entry.date) !== monthKey) continue;
    if (!ids.has(entry.from) || !targets.has(entry.to)) continue;
    shifts[entry.from] = money(shifts[entry.from] - entry.amount);
    shifts[entry.to] = money(shifts[entry.to] + entry.amount);
  }
  const factor = window.factor;
  const lines = [...LOCKED, ...KEPT].map(item => {
    const budget = money(item.amount * factor + (shifts[item.id] || 0));
    const used = money(spent[item.id] || 0);
    return { ...item, budget, used, left: money(budget - used) };
  });
  const lockedSum = sum(LOCKED);
  const keptSum = sum(KEPT);
  const freeBudget = money((INCOME - lockedSum - keptSum) * factor + shifts.free);
  const freeSpent = money(spent.free || 0);
  const freeLeft = money(freeBudget - freeSpent);
  const deficits = money(lines.reduce((s, line) => s + Math.max(0, -line.left), 0));
  const funding = fundingStatus(state, year, month);
  const safeFreeLeft = money(freeLeft - deficits - funding.uncovered);
  return { window, monthKey, lines, rows, shifts, freeBudget, freeSpent, freeLeft,
    lockedSum: money(lockedSum * factor + LOCKED.reduce((total,item)=>total+(shifts[item.id]||0),0)), keptSum: money(keptSum * factor + KEPT.reduce((total,item)=>total+(shifts[item.id]||0),0)), deficits, safeFreeLeft, funding,
    over: [...lines.filter(row => row.left < 0).map(row => row.id), ...(freeLeft < 0 ? ['free'] : [])],
    closed: safeEvents(state).some(entry => entry.kind === 'close' && entry.month === monthKey) };
}

export function proposedClose(state, year, month) {
  const view = monthView(state, year, month);
  const allocations = Object.fromEntries(FUND_IDS.map(id => [id, 0]));
  allocations.reserve = money(Math.max(0, view.freeLeft));
  for (const line of view.lines.filter(item => !LOCKED.some(x => x.id === item.id))) {
    const left = Math.max(0, line.left);
    if (line.sink) allocations[line.id] = money(left);
    else allocations.reserve = money(allocations.reserve + left);
  }
  return { ...view, allocations, total: money(Object.values(allocations).reduce((a, b) => a + b, 0)),
    ready: !view.window.partial && !view.closed && view.over.length === 0 && view.funding.found && view.funding.uncovered === 0 };
}

export function canTransfer(state, date, from, to, amount) {
  if (!ids.has(from) || !targets.has(to) || from === to || !Number.isFinite(amount) || amount <= 0) return false;
  const [year, month] = date.split('-').map(Number);
  const view = monthView(state, year, month);
  if (view.closed || date < view.window.start || date > view.window.end) return false;
  const source = from === 'free' ? view.freeLeft : view.lines.find(line => line.id === from)?.left;
  return Number.isFinite(source) && money(amount) <= source;
}

export function canUseFund(state, fundId, amount, expenseId) {
  if (!fundIds.has(fundId) || !Number.isFinite(amount) || amount <= 0) return false;
  const expense = safeTransactions(state).find(tx => tx.type === 'expense' && tx.id === expenseId && money(tx.amount) === money(amount));
  if (!expense) return false;
  const [year, month] = expense.date.slice(0, 7).split('-').map(Number);
  if (monthView(state, year, month).closed) return false;
  if (safeEvents(state).some(event => event.kind === 'fundUse' && event.expenseId === expenseId)) return false;
  return money(amount) <= (balancesFromDeposits(state).balances[fundId] || 0);
}

export function closingAllowed(state, year, month, todayISO) {
  const preview = proposedClose(state, year, month);
  return preview.ready && !preview.window.partial && todayISO > preview.window.end;
}

export function dayPace(left, currentDate, endDate) {
  const start = Math.max(Date.parse(currentDate + 'T12:00:00Z'), Date.parse(endDate.slice(0, 7) + '-01T12:00:00Z'));
  const finish = Date.parse(endDate + 'T12:00:00Z');
  const days = Math.max(1, Math.round((finish - start) / 86400000) + 1);
  return { days, daily: money(left / days), weekly: money(left * 7 / days) };
}

export function makeEntry(kind, fields, id = crypto.randomUUID()) {
  return { id, kind, ...fields };
}