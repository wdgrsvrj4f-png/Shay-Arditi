import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, previewSpend, classifyExpense, sum, money, LOCKED, KEPT, INCOME } from '../shared/plan.js';

test('the agreed plan fits inside 12,500 and leaves 1,142.66 free', () => {
  assert.equal(sum(LOCKED), 7035.34);
  assert.equal(sum(KEPT), 4322);
  assert.equal(money(INCOME - sum(LOCKED) - sum(KEPT)), 1142.66);
});

test('november starts on the 1st with a full budget, and a restaurant comes out of free money', () => {
  const before = summarize([], '2026-11-09');
  assert.equal(before.window.start, '2026-11-01');
  assert.equal(before.freeBudget, 1142.66);
  assert.equal(before.started, true);
  const restaurant = { id: 'a', type: 'expense', name: 'אכלתי במסעדה', amount: 85, category: 'leisure', method: 'credit', date: '2026-11-12' };
  assert.equal(classifyExpense(restaurant), 'free');
  const after = summarize([restaurant, { id: 'b', type: 'expense', name: 'שופרסל', amount: 120, category: 'groceries', method: 'debit', date: '2026-11-11' }], '2026-11-12');
  assert.equal(after.freeSpent, 85);
  assert.equal(after.freeLeft, 1057.66);
  assert.equal(after.lines.find(item => item.id === 'food').used, 120);
  assert.equal(previewSpend(after, 1100).ok, false);
  assert.equal(previewSpend(after, 40).ok, true);
});

test('unused free money becomes reserve only after the month closes', () => {
  const november = summarize([{ id: 'a', type: 'expense', name: 'קפה', amount: 100, category: 'leisure', method: 'cash', date: '2026-11-15' }], '2026-12-02');
  assert.equal(november.reserve, 1042.66);
  assert.equal(november.freeBudget, 1142.66);
  assert.equal(november.pots.vacation, 500);
});
