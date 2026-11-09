import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthView, canTransfer, proposedClose, closingAllowed, balancesFromDeposits, canUseFund, dayPace } from '../shared/plan-ledger.js';
import { validateState } from '../netlify/lib/validation.mjs';
import { mergeChanges } from '../shared/sync.js';
import { demoData } from '../scripts/demo-data.mjs';

const fresh = () => ({ transactions: [], planEvents: [] });
const event = (id, kind, properties) => ({id,kind,date:'2026-12-20',...properties});

test('December starts with exactly the agreed free balance', () => {
  const view = monthView(fresh(),2026,12);
  assert.equal(view.lockedSum,7035.34);
  assert.equal(view.keptSum,4322);
  assert.equal(view.freeBudget,1142.66);
  assert.equal(view.safeFreeLeft,1142.66);
  assert.equal(dayPace(view.safeFreeLeft,'2026-12-15','2026-12-31').days,17);
});
test('moving a budget amount redistributes but does not generate money', () => {
  const state=fresh();
  assert.equal(canTransfer(state,'2026-12-15','free','food',100),true);
  state.planEvents.push(event('x','transfer',{from:'free',to:'food',amount:100}));
  const view=monthView(state,2026,12);
  assert.equal(view.freeBudget,1042.66);
  assert.equal(view.lines.find(x=>x.id==='food').budget,1100);
  assert.equal(view.lockedSum+view.keptSum+view.freeBudget,12500);
  assert.equal(canTransfer(state,'2026-12-15','free','food',2000),false);
});
test('overspent essential expenses immediately reduce safe-to-spend and block close', () => {
  const state=fresh();
  state.transactions.push({id:'a',type:'expense',date:'2026-12-10',name:'סופר',amount:1200,method:'debit',category:'groceries'});
  let view=monthView(state,2026,12);
  assert.equal(view.deficits,200);
  assert.equal(view.safeFreeLeft,942.66);
  assert.equal(closingAllowed(state,2026,12,'2027-01-01'),false);
  state.planEvents.push(event('t','transfer',{from:'free',to:'food',amount:200}));
  view=monthView(state,2026,12);
  assert.equal(view.deficits,0);
  assert.equal(view.safeFreeLeft,942.66);
  assert.equal(closingAllowed(state,2026,12,'2027-01-01'),true);
});
test('a month close creates proposals, never claims a bank deposit before confirmation', () => {
  const state=fresh();
  const close=proposedClose(state,2026,12);
  assert.equal(close.ready,true);
  assert.equal(close.allocations.vacation,500);
  assert.equal(close.allocations.insurance,667);
  assert.equal(close.allocations.reserve>1142,true);
  state.planEvents.push(event('c','close',{date:'2027-01-01',month:'2026-12',allocations:close.allocations}));
  assert.equal(balancesFromDeposits(state).balances.vacation,0);
  assert.equal(balancesFromDeposits(state).awaitingDeposit.vacation,500);
  assert.equal(closingAllowed(state,2026,12,'2027-01-02'),false);
  state.planEvents.push(event('d','depositConfirmed',{date:'2027-01-02',closeId:'c'}));
  assert.equal(balancesFromDeposits(state).balances.vacation,500);
  assert.equal(balancesFromDeposits(state).awaitingDeposit.vacation,0);
});
test('old savings fund pays an actual purchase once, not the new monthly allocation', () => {
  const state=fresh();
  state.planEvents.push(event('initial','fundOpening',{date:'2026-11-20',fundId:'vacation',amount:3000}));
  state.transactions.push({id:'hotel',type:'expense',name:'מלון',date:'2026-12-10',amount:2000,method:'credit',category:'leisure',creditDueDate:'2027-01-02'});
  assert.equal(canUseFund(state,'vacation',2000,'hotel'),true);
  state.planEvents.push(event('use','fundUse',{fundId:'vacation',expenseId:'hotel',amount:2000}));
  assert.equal(canUseFund(state,'vacation',2000,'hotel'),false);
  assert.equal(monthView(state,2026,12).lines.find(x=>x.id==='vacation').used,0);
  assert.equal(balancesFromDeposits(state).balances.vacation,1000);
});
test('the November transition cannot be automatically deposited', () => {
  assert.equal(proposedClose(fresh(),2026,11).ready,false);
  assert.equal(closingAllowed(fresh(),2026,11,'2026-12-01'),false);
});
test('server validation allows the new ledger and rejects duplicate fund claims', () => {
  const state=demoData();state.planEvents=[];
  assert.ok(validateState(structuredClone(state)));
  state.planEvents.push(event('open','fundOpening',{fundId:'reserve',amount:1000}));
  assert.ok(validateState(structuredClone(state)));
  state.planEvents.push(event('open2','fundOpening',{fundId:'reserve',amount:1000}));
  assert.equal(validateState(structuredClone(state)),null);
});
test('independent device events merge without clobbering existing transactions', () => {
  const base=demoData();base.planEvents=[];
  const a=structuredClone(base),b=structuredClone(base);
  a.planEvents.push(event('one','fundOpening',{fundId:'reserve',amount:300}));
  b.planEvents.push(event('two','fundOpening',{fundId:'vacation',amount:100}));
  const result=mergeChanges(base,a,b);
  assert.equal(result.state.planEvents.length,2);
  assert.equal(result.state.transactions.length,base.transactions.length);
});
