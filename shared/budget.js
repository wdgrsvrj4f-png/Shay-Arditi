export function commitmentAmount(item) {
  const value = Number(item.kind === 'debt' ? item.monthlyPayment : item.amount);
  if (!Number.isFinite(value)) throw new Error('Invalid commitment amount');
  return value;
}

export function cardGroups(state) {
  const settled = new Set(state.creditPayments.filter(p => p.status === 'paid').flatMap(p => p.expenseIds || []));
  const groups = new Map();
  function groupFor(dueDate) {
    if (!groups.has(dueDate)) groups.set(dueDate, { dueDate, amount: 0, expenseIds: [], paymentIds: [], manual: false });
    return groups.get(dueDate);
  }
  const pending = state.creditPayments.filter(p => p.status === 'pending');
  const covered = new Set(pending.filter(p => p.amountMode === 'statement').flatMap(p => p.coveredExpenseIds || []));
  for (const expense of state.transactions) {
    if (expense.type !== 'expense' || expense.method !== 'credit' || !expense.creditDueDate || settled.has(expense.id)) continue;
    const group = groupFor(expense.creditDueDate);
    if (!covered.has(expense.id)) group.amount += Number(expense.amount);
    group.expenseIds.push(expense.id);
  }
  for (const payment of pending) {
    const group = groupFor(payment.dueDate);
    // Existing manual entries were described as purchases made before tracking.
    // Preserve that meaning unless the user explicitly selects a full statement.
    group.amount += Number(payment.amount);
    group.manual = true;
    group.paymentIds.push(payment.id);
  }
  return [...groups.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
