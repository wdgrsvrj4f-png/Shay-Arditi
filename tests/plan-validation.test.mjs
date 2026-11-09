import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validPlanUpdate } from '../netlify/lib/plan-validation.mjs';
import { validateState } from '../netlify/lib/validation.mjs';
import { proposedClose } from '../shared/plan-ledger.js';
import { demoData } from '../scripts/demo-data.mjs';
const state = () => ({...demoData(),transactions:[{id:'salary',type:'income',date:'2026-10-10',name:'משכורת',amount:12500}],planEvents:[]});
const opening = {id:'opening',kind:'fundOpening',date:'2026-10-01',fundId:'vacation',amount:500};
const expense = {id:'hotel',type:'expense',date:'2026-11-02',name:'מלון',amount:300,method:'debit',category:'leisure'};

test('server enforces transfer and real fund balances, including multiple new operations',()=>{
 const current=state(), next=structuredClone(current);
 next.planEvents.push({...opening});
 next.transactions.push(expense);
 next.planEvents.push({id:'use',kind:'fundUse',date:'2026-11-02',fundId:'vacation',expenseId:'hotel',amount:300});
 assert.equal(validPlanUpdate(current,next,'2026-11-10'),true);
 next.planEvents.push({id:'move',kind:'fundMove',date:'2026-11-03',from:'vacation',to:'reserve',amount:201});
 assert.equal(validPlanUpdate(current,next,'2026-11-10'),false);
 next.planEvents.pop();
 next.planEvents.push({id:'transfer',kind:'transfer',date:'2026-11-03',from:'free',to:'food',amount:2000});
 assert.equal(validPlanUpdate(current,next,'2026-11-10'),false);
});
test('server closes only a funded, ended, balanced month with exact proposed allocations',()=>{
 const current=state(), next=structuredClone(current);
 const close={id:'close',kind:'close',date:'2026-12-01',month:'2026-11',allocations:proposedClose(current,2026,11).allocations};
 next.planEvents.push(close);
 assert.equal(validPlanUpdate(current,next,'2026-11-30'),false);
 assert.equal(validPlanUpdate(current,next,'2026-12-01'),true);
 close.allocations.vacation+=1;
 assert.equal(validPlanUpdate(current,next,'2026-12-01'),false);
 close.allocations.vacation-=1;
 current.transactions=[];next.transactions=[];
 assert.equal(validPlanUpdate(current,next,'2026-12-01'),false);
});
test('saved ledger and closed expense history cannot be silently rewritten',()=>{
 const current=state();current.transactions.push(expense);
 current.planEvents.push({id:'close',kind:'close',date:'2026-12-01',month:'2026-11',allocations:{vacation:200}});
 let next=structuredClone(current);next.transactions[1].amount=200;
 assert.equal(validPlanUpdate(current,next,'2026-12-02'),false);
 next=structuredClone(current);next.planEvents=[];
 assert.equal(validPlanUpdate(current,next,'2026-12-02'),false);
 next=structuredClone(current);next.settings.openingBankBalance=1234;
 assert.equal(validPlanUpdate(current,next,'2026-12-02'),true);
});
test('server rejects excess salary claims and invalid plan names without changing legacy data',()=>{
 const current=state(),next=structuredClone(current);
 next.planEvents.push({id:'excess',kind:'salaryExcess',date:'2026-11-10',budgetMonth:'2026-11',amount:500});
 assert.equal(validPlanUpdate(current,next,'2026-11-10'),false);
 next.planEvents=[];next.transactions.push({...expense,plan:'invalid-category'});
 assert.equal(validateState(next),null);
});
test('immutable history compares field values rather than JSON property order',()=>{
 const current=state();current.planEvents.push(opening);
 const next=structuredClone(current);next.planEvents=[Object.fromEntries(Object.entries(opening).reverse())];
 assert.equal(validPlanUpdate(current,next,'2026-11-10'),true);
});

test('budget API rejects a forged fund operation and accepts a valid deposit opening',async()=>{
 const { createBudgetHandler }=await import('../netlify/functions/budget.mjs');
 const { memoryStore }=await import('../scripts/memory-store.mjs');
 const { sessionCookie }=await import('../netlify/lib/auth.mjs');
 process.env.BUDGET_ACCESS_KEY='test-only-access-key-for-plan-api';
 const store=memoryStore(state()),handler=createBudgetHandler(async()=>store);
 const cookie=sessionCookie(process.env.BUDGET_ACCESS_KEY).split(';')[0];
 const request=(method,body,revision)=>new Request('https://budget.example/api/budget',{method,headers:{cookie,...(body?{'Content-Type':'application/json','X-Budget-Revision':revision}:{})},body:body?JSON.stringify(body):undefined});
 const read=await handler(request('GET'));const current=await read.json();delete current._rev;
 const revision=read.headers.get('etag');
 const bad=structuredClone(current);bad.planEvents.push({id:'move',kind:'fundMove',date:'2026-10-01',from:'vacation',to:'reserve',amount:1});
 assert.equal((await handler(request('PUT',bad,revision))).status,400);
 assert.equal((await store.getWithMetadata()).data.planEvents.length,0);
 current.planEvents.push(opening);
 assert.equal((await handler(request('PUT',current,revision))).status,200);
 assert.equal((await store.getWithMetadata()).data.planEvents.length,1);
});
