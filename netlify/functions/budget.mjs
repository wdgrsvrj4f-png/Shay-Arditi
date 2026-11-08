import { getStore } from "@netlify/blobs";

const store = getStore("simple-budget");
const blobKey = "shared-budget";
const maxBodyBytes = 256_000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const transactionTypes = new Set(["income", "expense", "debt_payment", "cash_withdrawal"]);
const methods = new Set(["debit", "credit", "cash", "bank"]);
const categories = new Set(["groceries", "transport", "home", "health", "leisure", "other"]);
const destinations = new Set(["reserve", "savings", "debt", "next_cycle", "other"]);

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function validDate(value, optional = false) {
  if (optional && (value === undefined || value === null || value === "")) return true;
  return typeof value === "string" && datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
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

function validateState(value) {
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

  const arrays = ["obligations", "debts", "deletedObligationIds", "deletedDebtIds", "transactions", "deletedTransactionIds", "creditPayments", "surplusActions", "processedTelegramUpdates"];
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
    if (item.type === "expense" && (!categories.has(item.category) || !methods.has(item.method))) return null;
    if (item.type === "debt_payment" && !methods.has(item.method)) return null;
    if (item.type === "cash_withdrawal" && !validAmount(item.amount)) return null;
  }

  for (const item of value.creditPayments) {
    if (!item || !validId(item.id) || !validDate(item.dueDate) || !validAmount(item.amount)) return null;
    if (!new Set(["pending", "paid"]).has(item.status) || !validDate(item.paidDate, true)) return null;
    if (!Array.isArray(item.expenseIds) || item.expenseIds.length > 500 || item.expenseIds.some(id => !validId(id))) return null;
  }

  for (const item of value.surplusActions) {
    if (!item || !validId(item.id) || !validAmount(item.amount) || !destinations.has(item.destination)) return null;
    if (!validDate(item.date) || !validDate(item.cycleKey)) return null;
  }

  if (value.processedTelegramUpdates.some(id => !Number.isSafeInteger(Number(id)))) return null;
  if (value.telegramChatId !== undefined && value.telegramChatId !== null && (typeof value.telegramChatId !== "string" || value.telegramChatId.length > 40)) return null;
  if (value.pendingTelegramExpense !== undefined && value.pendingTelegramExpense !== null) {
    if (typeof value.pendingTelegramExpense.text !== "string" || value.pendingTelegramExpense.text.length > 300) return null;
  }
  return value;
}

export default async function handler(request) {
  if (request.method === "GET") {
    const data = await store.get(blobKey, { type: "json" });
    return reply(data ?? { months: {} });
  }

  if (request.method !== "PUT") return reply({ error: "Method not allowed" }, 405);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBodyBytes) return reply({ error: "The update is too large" }, 413);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }

  const clean = validateState(payload);
  if (!clean) return reply({ error: "Invalid budget data" }, 400);

  await store.setJSON(blobKey, clean);
  return reply({ saved: true });
}
