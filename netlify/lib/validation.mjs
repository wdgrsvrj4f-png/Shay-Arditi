const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const transactionTypes = new Set(["income", "expense", "debt_payment", "cash_withdrawal"]);
const methods = new Set(["debit", "credit", "cash", "bank"]);
const categories = new Set(["groceries", "fuel", "transport", "home", "health", "leisure", "other"]);
const destinations = new Set(["reserve", "savings", "debt", "next_cycle", "other"]);
const planIds = new Set(["free","pepper","tesla-loan","yotam","school","gym","phone","spotify","food","charge","hair","insurance","wash","girls-clothes","gifts","kids","school-stuff","allowance","my-clothes","care","health","gadgets","events","vacation","license"]);
const moveable = new Set([...planIds].filter(x => !["pepper","tesla-loan","yotam","school","gym","phone","spotify"].includes(x)));
const fundIds = new Set(["reserve","insurance","girls-clothes","gifts","my-clothes","health","gadgets","events","vacation","license"]);

function validDate(value, optional = false) {
  if (optional && (value === undefined || value === null || value === "")) return true;
  return typeof value === "string" && datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function validId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 100;
}

function validName(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 100;
}

function validAmount(value, allowZero = false) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= (allowZero ? 0 : 0.01) && amount <= 1_000_000;
}

function validate(value) {
  if (!value || typeof value !== "object" || value.version !== 2 || !value.settings || typeof value.settings !== "object") return null;
  const { settings } = value;
  const settingsDay = item => Number.isInteger(Number(item)) && Number(item) >= 1 && Number(item) <= 28;
  const dueDay = item => Number.isInteger(Number(item)) && Number(item) >= 1 && Number(item) <= 31;
  if (!settingsDay(settings.paydayDay) || !settingsDay(settings.creditClosingDay) || !settingsDay(settings.creditPaymentDay)) return null;
  if (!validDate(settings.openingDate)) return null;
  if (!Number.isFinite(Number(settings.openingBankBalance)) || Math.abs(Number(settings.openingBankBalance)) > 1_000_000) return null;
  if (!validAmount(settings.openingCashBalance, true)) return null;
  if (!settings.budgets || typeof settings.budgets !== "object" || Array.isArray(settings.budgets)) return null;
  for (const category of categories) {
    if (!validAmount(settings.budgets[category] ?? 0, true)) return null;
  }

  for (const key of ["deletedObligationIds", "deletedDebtIds", "deletedTransactionIds"]) {
    if (value[key] === undefined) value[key] = [];
  }
  if (value.planEvents === undefined) value.planEvents = [];
  const arrays = ["obligations", "debts", "deletedObligationIds", "deletedDebtIds", "transactions", "deletedTransactionIds", "creditPayments", "surplusActions", "planEvents", "processedTelegramUpdates"];
  for (const key of arrays) {
    if (!Array.isArray(value[key]) || value[key].length > (key === "processedTelegramUpdates" ? 500 : 5_000)) return null;
  }
  if (value.deletedTransactionIds.some(id => !validId(id))) return null;
  if (value.deletedObligationIds.some(id => !validId(id)) || value.deletedDebtIds.some(id => !validId(id))) return null;

  for (const item of value.obligations) {
    if (!item || !validId(item.id) || !validName(item.name) || !validAmount(item.amount)) return null;
    if (!categories.has(item.category) || !methods.has(item.method) || !dueDay(item.dueDay)) return null;
  }

  for (const item of value.debts) {
    if (!item || !validId(item.id) || !validName(item.name) || !validAmount(item.balance, true)) return null;
    if (!validAmount(item.monthlyPayment, true) || !dueDay(item.dueDay)) return null;
  }

  for (const item of value.transactions) {
    if (!item || !validId(item.id) || !transactionTypes.has(item.type) || !validName(item.name) || !validAmount(item.amount)) return null;
    if (!validDate(item.date) || !validDate(item.creditDueDate, true)) return null;
    if (item.type === "expense" && item.method === "credit" && !validDate(item.creditDueDate)) return null;
    if (item.principal !== undefined && (!validAmount(item.principal, true) || Number(item.principal) > Number(item.amount))) return null;
    if (item.type === "expense" && (!categories.has(item.category) || !methods.has(item.method))) return null;
    if (item.type === "debt_payment" && !methods.has(item.method)) return null;
    if (item.type === "cash_withdrawal" && !validAmount(item.amount)) return null;
  }

  for (const item of value.creditPayments) {
    if (!item || !validId(item.id) || !validDate(item.dueDate) || !validAmount(item.amount)) return null;
    if (item.status === "paid" && !validDate(item.paidDate)) return null;
    if (item.amountMode !== undefined && !["remainder", "statement"].includes(item.amountMode)) return null;
    if (item.status === "pending" && item.expenseIds.length) return null;
    if (item.coveredExpenseIds !== undefined && (!Array.isArray(item.coveredExpenseIds) || item.coveredExpenseIds.length > 500 || item.coveredExpenseIds.some(id => !validId(id)))) return null;
    if (!new Set(["pending", "paid"]).has(item.status) || !validDate(item.paidDate, true)) return null;
    if (!Array.isArray(item.expenseIds) || item.expenseIds.length > 500 || item.expenseIds.some(id => !validId(id))) return null;
  }

  const pendingDates = new Map();
  for (const item of value.creditPayments.filter(item => item.status === 'pending')) {
    const existing = pendingDates.get(item.dueDate) || [];
    if (existing.length && (item.amountMode === 'statement' || existing.some(p => p.amountMode === 'statement'))) return null;
    existing.push(item); pendingDates.set(item.dueDate, existing);
  }
  for (const item of value.surplusActions) {
    if (!item || !validId(item.id) || !validAmount(item.amount) || !destinations.has(item.destination)) return null;
    if (!validDate(item.date) || !validDate(item.cycleKey)) return null;
  }

  // Budget plan events are additive and preserve the old v2 data format.
  for (const item of value.planEvents) {
    if (!item || !validId(item.id) || !validDate(item.date) || !validName(item.kind)) return null;
    if (item.kind === 'transfer') {
      if (!moveable.has(item.from) || !moveable.has(item.to) || item.from === item.to || !validAmount(item.amount)) return null;
    } else if (item.kind === 'fundUse') {
      if (!fundIds.has(item.fundId) || !validAmount(item.amount) || !validId(item.expenseId)) return null;
      const expense = value.transactions.find(tx => tx.id === item.expenseId && tx.type === 'expense');
      if (!expense || Math.abs(Number(expense.amount) - Number(item.amount)) > 0.009) return null;
    } else if (item.kind === 'fundOpening') {
      if (!fundIds.has(item.fundId) || !validAmount(item.amount)) return null;
    } else if (item.kind === 'fundMove') {
      if (!fundIds.has(item.from) || !fundIds.has(item.to) || item.from === item.to || !validAmount(item.amount)) return null;
    } else if (item.kind === 'close') {
      if (!/^\\d{4}-\\d{2}$/.test(item.month) || !validDate(item.month + '-01')) return null;
      if (typeof item.allocations !== 'object' || item.allocations === null || Array.isArray(item.allocations)) return null;
      if (Object.entries(item.allocations).some(([id, amount]) => !fundIds.has(id) || !validAmount(amount, true))) return null;
      if (Object.values(item.allocations).reduce((a, b) => a + Number(b), 0) > 12500) return null;
    } else if (item.kind === 'depositConfirmed') {
      if (!validId(item.closeId)) return null;
    } else return null;
  }
  if (new Set(value.planEvents.map(item => item.id)).size !== value.planEvents.length) return null;
  if (value.planEvents.filter(item => item.kind === 'fundUse').some((item, i, arr) => arr.findIndex(x => x.expenseId === item.expenseId) !== i)) return null;
  if (value.planEvents.filter(item => item.kind === 'close').some((item, i, arr) => arr.findIndex(x => x.month === item.month) !== i)) return null;
  if (value.planEvents.filter(item => item.kind === 'depositConfirmed').some((item, i, arr) => arr.findIndex(x => x.closeId === item.closeId) !== i)) return null;
  if (value.planEvents.filter(item => item.kind === 'fundOpening').some((item, i, arr) => arr.findIndex(x => x.fundId === item.fundId) !== i)) return null;
    if (value.processedTelegramUpdates.some(id => !Number.isSafeInteger(Number(id)))) return null;
  if (value.telegramChatId !== undefined && value.telegramChatId !== null && (typeof value.telegramChatId !== "string" || value.telegramChatId.length > 40)) return null;
  if (value.pendingTelegramExpense !== undefined && value.pendingTelegramExpense !== null) {
    if (typeof value.pendingTelegramExpense.text !== "string" || value.pendingTelegramExpense.text.length > 300) return null;
  }
  for (const key of ["obligations", "debts", "transactions", "creditPayments", "surplusActions"]) {
    if (new Set(value[key].map(item => item.id)).size !== value[key].length) return null;
  }
  return value;
}


export function validateState(value) {
  try { return validate(value); } catch { return null; }
}
