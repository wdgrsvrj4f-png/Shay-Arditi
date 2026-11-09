import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as plan from '../shared/plan.js';
import * as ledger from '../shared/plan-ledger.js';
import { cardGroups } from '../shared/budget.js';
import { demoData } from '../scripts/demo-data.mjs';
async function browser() {
 const nodes=new Map();
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',hidden:false,textContent:'',dataset:{},addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},dispatchEvent(){}});return nodes.get(selector);};
 const context=vm.createContext({...plan,...ledger,cardGroups,structuredClone,Date,Intl,Event,console,crypto:globalThis.crypto,
 document:{querySelector:node,querySelectorAll(){return [];}},window:{addEventListener(){}},fetch:async()=>{throw Error('test offline');}});
 let source=(await readFile(new URL('../plan.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 source=source.replace(/^load\(\);$/m,'');
 vm.runInContext(source,context);
 context.fixture=demoData();
 vm.runInContext('snapshot=fixture;chosenMonth="2026-11";',context);
 return {context,nodes};
}
test('the complete plan screen renders all forms without a runtime exception',async()=>{
 const {context,nodes}=await browser();
 vm.runInContext('render()',context);
 assert.match(nodes.get('#hero').innerHTML,/12,500/);
 assert.match(nodes.get('#actions').innerHTML,/id="quick-expense"/);
 assert.match(nodes.get('#actions').innerHTML,/name="date" required value="2026-11-\d{2}"/);
 assert.match(nodes.get('#closing').innerHTML,/close-month/);
 assert.match(nodes.get('#control').innerHTML,/אשראי/);
});
test('a failed initial read leaves a visible explanation and retry login',async()=>{
 const {context,nodes}=await browser();
 vm.runInContext('snapshot=null',context);await vm.runInContext('load()',context);
 assert.equal(nodes.get('#login').hidden,false);
 assert.equal(nodes.get('#login-error').textContent,'test offline');
});
