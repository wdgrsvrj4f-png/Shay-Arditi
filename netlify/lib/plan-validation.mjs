import { isDeepStrictEqual } from 'node:util';
import { balancesFromDeposits, canTransfer, canUseFund, closingAllowed, fundingStatus, monthView, proposedClose } from '../../shared/plan-ledger.js';

// Check new ledger operations against the same rules as the UI. Existing saved
// events stay untouched; old clients may continue editing unrelated cashflow.
export function validPlanUpdate(current, next, today) {
  const events = current.planEvents || [];
  const incoming = next.planEvents || [];
  const byId = new Map(incoming.map(event => [event.id, event]));
  if (events.some(event => !isDeepStrictEqual(byId.get(event.id), event))) return false;
  const closed = new Set(events.filter(event => event.kind === 'close').map(event => event.month));
  const previous = new Map((current.transactions || []).map(tx => [tx.id, tx]));
  const transactions = new Map((next.transactions || []).map(tx => [tx.id, tx]));
  for (const id of new Set([...previous.keys(), ...transactions.keys()])) {
    const before = previous.get(id), after = transactions.get(id);
    if ([before, after].some(tx => tx?.type === 'expense' && closed.has(tx.date.slice(0, 7)))
      && !isDeepStrictEqual(before, after)) return false;
  }
  const known = new Set(events.map(event => event.id));
  const replay = { ...next, planEvents: [...events] };
  for (const event of incoming.filter(event => !known.has(event.id))) {
    const balances = balancesFromDeposits(replay).balances;
    if (event.date > today) return false;
    if (event.kind === 'transfer') {
      if (!canTransfer(replay,event.date,event.from,event.to,Number(event.amount))) return false;
    } else if (event.kind === 'fundUse') {
      if (!canUseFund(replay,event.fundId,Number(event.amount),event.expenseId)) return false;
    } else if (event.kind === 'fundMove') {
      if (Number(event.amount) > balances[event.from]) return false;
    } else if (event.kind === 'fundUseReversal') {
      const use = replay.planEvents.find(item => item.id === event.fundUseId);
      const tx = transactions.get(use?.expenseId);
      if (!tx || monthView(replay,...tx.date.slice(0,7).split('-').map(Number)).closed) return false;
    } else if (event.kind === 'close') {
      const [year, month] = event.month.split('-').map(Number);
      if (!closingAllowed(replay,year,month,today) || event.date <= monthView(replay,year,month).window.end) return false;
      const expected = proposedClose(replay,year,month).allocations;
      if (Object.keys(expected).some(id => Number(event.allocations[id] || 0) !== expected[id])) return false;
    } else if (event.kind === 'reserveTopUp' || event.kind === 'salaryExcess') {
      const [year, month] = event.budgetMonth.split('-').map(Number);
      const funding = fundingStatus(replay,year,month);
      const amount = Number(event.amount);
      if (!funding.found) return false;
      if (event.kind === 'reserveTopUp' && (amount > funding.uncovered || amount > balances.reserve)) return false;
      if (event.kind === 'salaryExcess' && amount > funding.excessToDeposit) return false;
    }
    replay.planEvents.push(event);
  }
  const originalBalances = balancesFromDeposits(current).balances;
  return Object.entries(balancesFromDeposits(replay).balances).every(([id,value]) => Number.isFinite(value) && value >= Math.min(0, originalBalances[id] || 0));
}
