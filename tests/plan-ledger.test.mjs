import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthView, canTransfer, proposedClose, closingAllowed, balancesFromDeposits, canUseFund, dayPace } from '../shared/plan-ledger.js';
import { validateState } from '../netlify/lib/validation.mjs';
import { mergeChanges } from '../shared/sync.js';
import { demoData } from '../scripts/demo-data.mjs';

const fresh = () => ({ transactions: [], planEvents: [] });
const withSalary = (state, amount = 12500) => { state.transactions.push({id:'salary',type:'income',name:'משכורת',date:'2026-11-10',amount}); return state; };
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
  const state=withSalary(fresh());
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
  const state=withSalary(fresh());
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
test('November is a full calendar month and closes under the normal safeguards', () => {
  const state=fresh();
  const view=monthView(state,2026,11);
  assert.deepEqual(view.window,{start:'2026-11-01',end:'2026-11-30',factor:1,partial:false});
  assert.equal(view.lockedSum,7035.34);
  assert.equal(view.keptSum,4322);
  assert.equal(view.freeBudget,1142.66);
  assert.equal(view.lockedSum+view.keptSum+view.freeBudget,12500);
  assert.equal(dayPace(view.safeFreeLeft,'2026-11-01',view.window.end).days,30);
  assert.equal(proposedClose(state,2026,11).ready,false);
  state.transactions.push({id:'oct-salary',type:'income',name:'משכורת',date:'2026-10-10',amount:12500});
  const close=proposedClose(state,2026,11);
  assert.equal(close.ready,true);
  assert.equal(close.allocations.vacation,500);
  assert.equal(close.allocations.insurance,667);
  assert.equal(closingAllowed(state,2026,11,'2026-11-30'),false);
  assert.equal(closingAllowed(state,2026,11,'2026-12-01'),true);
  state.planEvents.push(event('nov-close','close',{date:'2026-12-01',month:'2026-11',allocations:close.allocations}));
  assert.equal(closingAllowed(state,2026,11,'2026-12-02'),false);
  assert.equal(balancesFromDeposits(state).balances.vacation,0);
  assert.equal(balancesFromDeposits(state).awaitingDeposit.vacation,500);
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

test('reversing a mistaken fund assignment restores both fund balance and normal expense classification', () => {
  const state=fresh();
  state.planEvents.push(event('initial','fundOpening',{fundId:'vacation',amount:2000}));
  state.transactions.push({id:'hotel',type:'expense',name:'מלון',date:'2026-12-10',amount:500,method:'debit',category:'leisure'});
  state.planEvents.push(event('u1','fundUse',{expenseId:'hotel',fundId:'vacation',amount:500}));
  assert.equal(balancesFromDeposits(state).balances.vacation,1500);
  assert.equal(monthView(state,2026,12).lines.find(x=>x.id==='vacation').used,0);
  state.planEvents.push(event('undo','fundUseReversal',{fundUseId:'u1'}));
  assert.equal(balancesFromDeposits(state).balances.vacation,2000);
  assert.equal(monthView(state,2026,12).lines.find(x=>x.id==='vacation').used,500);
  const snapshot=demoData();
  snapshot.transactions.push(state.transactions[0]);
  snapshot.planEvents=state.planEvents;
  assert.ok(validateState(snapshot));
});

test('a low salary safely decreases spendable money until physically covered from reserve', () => {
  const state=withSalary(fresh(),11000);
  let view=monthView(state,2026,12);
  assert.equal(view.funding.uncovered,1500);
  assert.equal(view.safeFreeLeft,-357.34);
  assert.equal(closingAllowed(state,2026,12,'2027-01-01'),false);
  state.planEvents.push(event('initial','fundOpening',{date:'2026-11-11',fundId:'reserve',amount:3000}));
  state.planEvents.push(event('covered','reserveTopUp',{date:'2026-11-12',budgetMonth:'2026-12',amount:1500}));
  view=monthView(state,2026,12);
  assert.equal(view.safeFreeLeft,1142.66);
  assert.equal(balancesFromDeposits(state).balances.reserve,1500);
  assert.equal(closingAllowed(state,2026,12,'2027-01-01'),true);
});
test('salary above budget only enters reserve after the user confirms the bank transfer', () => {
  const state=withSalary(fresh(),15000);
  assert.equal(monthView(state,2026,12).funding.excessToDeposit,2500);
  assert.equal(balancesFromDeposits(state).balances.reserve,0);
  state.planEvents.push(event('more','salaryExcess',{date:'2026-11-11',budgetMonth:'2026-12',amount:2500}));
  assert.equal(balancesFromDeposits(state).balances.reserve,2500);
  assert.equal(monthView(state,2026,12).funding.excessToDeposit,0);
});

test('full November includes early and month-end purchases once, preserving saved state', () => {
  const state=fresh();
  state.transactions=[
    {id:'oct',type:'expense',date:'2026-10-31',name:'קפה',amount:900,method:'cash'},
    {id:'early',type:'expense',date:'2026-11-01',name:'קפה',amount:100,method:'credit',creditDueDate:'2026-12-15'},
    {id:'ninth',type:'expense',date:'2026-11-09',name:'סופר',amount:120,method:'debit',category:'groceries'},
    {id:'last',type:'expense',date:'2026-11-30',name:'קפה',amount:50,method:'cash'},
    {id:'dec',type:'expense',date:'2026-12-01',name:'קפה',amount:25,method:'credit'},
    {id:'bill',type:'credit_payment',date:'2026-11-15',amount:100,method:'bank'},
    {id:'hotel',type:'expense',date:'2026-11-05',name:'מלון',amount:500,method:'credit'}
  ];
  state.creditPayments=[{id:'bill',amount:100,dueDate:'2026-12-15',status:'pending'}];
  state.planEvents=[
    event('opening','fundOpening',{date:'2026-10-01',fundId:'vacation',amount:1000}),
    event('use','fundUse',{date:'2026-11-05',fundId:'vacation',expenseId:'hotel',amount:500}),
    event('move','transfer',{date:'2026-11-03',from:'free',to:'food',amount:100})
  ];
  const before=structuredClone(state);
  const view=monthView(state,2026,11);
  assert.equal(view.rows.length,4);
  assert.equal(view.freeSpent,150);
  assert.equal(view.freeBudget,1042.66);
  assert.equal(view.safeFreeLeft,892.66);
  assert.equal(view.lines.find(x=>x.id==='food').used,120);
  assert.equal(view.lines.find(x=>x.id==='food').budget,1100);
  assert.equal(view.lines.find(x=>x.id==='vacation').used,0);
  assert.equal(balancesFromDeposits(state).balances.vacation,500);
  assert.equal(monthView(state,2026,12).freeSpent,25);
  assert.deepEqual(state,before);
});
