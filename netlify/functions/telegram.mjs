import { timingSafeEqual } from "node:crypto";
import { budgetStore, readSnapshot, writeSnapshot } from '../lib/store.mjs';
import { validateState } from '../lib/validation.mjs';
import { readJSON } from '../lib/http.mjs';
const categories = {
  groceries: "אוכל וקניות",
  fuel: "דלק",
  transport: "תחבורה",
  home: "בית וחשבונות",
  health: "בריאות",
  leisure: "בילויים ואישי",
  other: "אחר",
};

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function sameSecret(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function dateISO(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function creditDueDate(purchaseDate, settings) {
  const purchase = new Date(`${purchaseDate}T12:00:00`);
  const closingDay = Number(settings.creditClosingDay) || 15;
  const paymentDay = Number(settings.creditPaymentDay) || 15;
  const monthLength = new Date(purchase.getFullYear(), purchase.getMonth() + 1, 0).getDate();
  let close = new Date(purchase.getFullYear(), purchase.getMonth(), Math.min(closingDay, monthLength), 12);
  if (purchase.getDate() > closingDay) {
    const nextLength = new Date(purchase.getFullYear(), purchase.getMonth() + 2, 0).getDate();
    close = new Date(purchase.getFullYear(), purchase.getMonth() + 1, Math.min(closingDay, nextLength), 12);
  }
  const payment = new Date(close.getFullYear(), close.getMonth(), Math.min(paymentDay, new Date(close.getFullYear(), close.getMonth() + 1, 0).getDate()), 12);
  if (payment > close) return payment.toLocaleDateString('en-CA');
  const nextLength = new Date(close.getFullYear(), close.getMonth() + 2, 0).getDate();
  return new Date(close.getFullYear(), close.getMonth() + 1, Math.min(paymentDay, nextLength), 12).toLocaleDateString('en-CA');
}

function blankState() {
  return {
    version: 2,
    settings: {
      paydayDay: 10,
      creditClosingDay: 15,
      creditPaymentDay: 15,
      openingDate: dateISO(new Date()),
      openingBankBalance: 0,
      openingCashBalance: 0,
      budgets: Object.fromEntries(Object.keys(categories).map(key => [key, 0])),
    },
    obligations: [],
    debts: [],
    deletedObligationIds: [],
    deletedDebtIds: [],
    transactions: [],
    deletedTransactionIds: [],
    creditPayments: [],
    surplusActions: [],
    processedTelegramUpdates: [],
    telegramChatId: null,
    pendingTelegramExpense: null,
  };
}

function normalizeState(value) {
  if (value?.version === 2) return { ...blankState(), ...value };
  const state = blankState();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  for (const [monthKey, month] of Object.entries(value?.months || {})) {
    if (monthKey === currentMonth) state.settings.budgets.other = Number(month?.budget) || 0;
    for (const item of Array.isArray(month?.expenses) ? month.expenses : []) {
      const date = dateISO(new Date(Number(item.createdAt) || Date.now()));
      state.transactions.push({
        id: String(item.id || crypto.randomUUID()),
        type: "expense",
        name: String(item.name || "הוצאה"),
        amount: Number(item.amount) || 0,
        category: "other",
        method: "debit",
        date,
        budgeted: true,
      });
    }
  }
  return state;
}

function parseAmount(text) {
  const match = text.match(/(?<!\d)(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)/);
  if (!match) return null;
  const raw = match[1];
  const normalized = /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(raw) ? raw.replaceAll(",", "") : raw.replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 && amount <= 1_000_000 ? amount : null;
}

function parseMethod(text) {
  const value = text.toLowerCase();
  if (/אשראי|כרטיס|ויזה|מאסטרקארד/.test(value)) return "credit";
  if (/דיירקט|דביט|חיוב מיידי/.test(value)) return "debit";
  if (/מזומן|cash/.test(value)) return "cash";
  return null;
}

function parseCategory(text) {
  if (/סופר|מכולת|שוק|קניות|אוכל/.test(text)) return "groceries";
  if (/דלק|תדלוק|בנזין|תחנת דלק/.test(text)) return "fuel";
  if (/מונית|רב.?קו|אוטובוס|רכבת|חניה|תחבורה/.test(text)) return "transport";
  if (/חשמל|מים|ארנונה|אינטרנט|שכירות|בית/.test(text)) return "home";
  if (/תרופה|רופא|מרפאה|בריאות|בית.?מרקחת/.test(text)) return "health";
  if (/בילוי|סרט|קפה|מסעדה|בר|שווארמה|פיצה/.test(text)) return "leisure";
  return "other";
}

function expenseDate(text) {
  const date = new Date();
  if (/אתמול/.test(text)) date.setDate(date.getDate() - 1);
  return dateISO(date);
}

function expenseName(text) {
  return text
    .replace(/(?<!\d)(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)/, " ")
    .replace(/₪|שקל(?:ים)?|ש"ח|באשראי|אשראי|כרטיס|ויזה|מאסטרקארד|בדיירקט|דיירקט|דביט|במזומן|מזומן|cash|אתמול|היום/g, " ")
    .replace(/קניתי|שילמתי|הוצאתי|קנית|על/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

async function telegramCall(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed`);
  return response.json();
}

function rememberUpdate(state, updateId) {
  state.processedTelegramUpdates = [...(state.processedTelegramUpdates || []), updateId].slice(-500);
}

export function createTelegramHandler(getStore = budgetStore, callTelegram = telegramCall) {
return async function handler(request) {
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const pairingCode = process.env.TELEGRAM_PAIRING_CODE;
  if (!token || !webhookSecret || !pairingCode) return reply({ error: "Telegram setup is incomplete" }, 503);
  if (!sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret)) return reply({ error: "Unauthorized" }, 401);

  let update;
  try { update = await readJSON(request, 64_000); }
  catch { return reply({ error: "Invalid update" }, 400); }
  const updateId = Number(update?.update_id);
  const message = update?.message || update?.callback_query?.message;
  const chat = message?.chat;
  if (!Number.isSafeInteger(updateId) || !chat?.id || chat.type !== "private") return reply({ ok: true });

  const store = await getStore();
  for (let attempt = 0; attempt < 6; attempt++) {
    const snapshot = await readSnapshot(store);
    const state = normalizeState(snapshot.data);
    async function saveMergedState(value) {
      if (!validateState(value) || new TextEncoder().encode(JSON.stringify(value)).byteLength > 256_000) {
        throw new Error('Invalid or oversized budget');
      }
      if (!await writeSnapshot(store, value, snapshot.revision)) throw Object.assign(new Error('Conflict'), { conflict: true });
    }
    try { return await processUpdate(); }
    catch (error) { if (!error.conflict) throw error; }
    async function processUpdate() {
  if (state.processedTelegramUpdates.includes(updateId)) return reply({ ok: true, duplicate: true });
  const chatId = String(chat.id);
  const text = String(update?.message?.text || "").trim();

  if (!state.telegramChatId) {
    const [command, suppliedCode] = text.split(/\s+/, 2);
    if (command === "/pair" && sameSecret(suppliedCode, pairingCode)) {
      state.telegramChatId = chatId;
      rememberUpdate(state, updateId);
      await saveMergedState(state);
      await callTelegram(token, "sendMessage", { chat_id: chat.id, text: "הבוט חובר לחשבון התקציב שלך. אפשר לכתוב הוצאה בעברית." });
      return reply({ ok: true, paired: true });
    }
    rememberUpdate(state, updateId);
    await saveMergedState(state);
    await callTelegram(token, "sendMessage", { chat_id: chat.id, text: "כדי לחבר את הבוט, שלח /pair ואחריו קוד החיבור שהגדרת ב-Netlify." });
    return reply({ ok: true });
  }

  if (chatId !== String(state.telegramChatId)) return reply({ ok: true });

  if (/^\d{4,8}$/.test(text) && typeof store.get === "function") {
    const sync = await store.get("card-sync", { type: "json" });
    if (sync?.needsOtp && Date.now() - Number(sync.startedAt) < 10 * 60 * 1000) {
      await store.setJSON("card-otp", { code: text, expires: Date.now() + 5 * 60 * 1000 });
      rememberUpdate(state, updateId);
      await saveMergedState(state);
      await callTelegram(token, "sendMessage", { chat_id: chat.id, text: "הקוד נקלט. ממשיך למשוך את העסקאות." });
      return reply({ ok: true, otp: true });
    }
  }

  if (text === "משוך אשראי" || text === "/cardsync") {
    rememberUpdate(state, updateId);
    await saveMergedState(state);
    const { triggerCardSync } = await import("../lib/card-trigger.mjs");
    const started = await triggerCardSync({ user: true }).catch(() => false);
    await callTelegram(token, "sendMessage", { chat_id: chat.id, text: started
      ? "מתחיל למשוך את העסקאות. אם יגיע קוד, שלח לכאן רק את הספרות."
      : "אי אפשר להתחיל משיכה כרגע." });
    return reply({ ok: true, cardSync: true });
  }

  if (update?.callback_query) {
    const callback = update.callback_query;
    const expenseId = String(callback.data || "").replace(/^undo:/, "");
    const expense = state.transactions.find(item => item.id === expenseId && item.type === "expense");
    if (expense) {
      state.transactions = state.transactions.filter(item => item.id !== expenseId);
      state.deletedTransactionIds = [...new Set([...(state.deletedTransactionIds || []), expenseId])].slice(-5_000);
      rememberUpdate(state, updateId);
      await saveMergedState(state);
      await callTelegram(token, "answerCallbackQuery", { callback_query_id: callback.id, text: "ההוצאה בוטלה" });
      await callTelegram(token, "editMessageText", { chat_id: chat.id, message_id: message.message_id, text: "ההוצאה בוטלה." });
    } else {
      rememberUpdate(state, updateId);
      await saveMergedState(state);
      await callTelegram(token, "answerCallbackQuery", { callback_query_id: callback.id, text: "לא מצאתי את ההוצאה" });
    }
    return reply({ ok: true });
  }

  if (!text || text.startsWith("/")) {
    if (text === "/cancel" && state.pendingTelegramExpense) {
      state.pendingTelegramExpense = null;
      rememberUpdate(state, updateId);
      await saveMergedState(state);
      await callTelegram(token, "sendMessage", { chat_id: chat.id, text: "הכניסה בוטלה. לא נרשמה הוצאה." });
      return reply({ ok: true, cancelled: true });
    }
    rememberUpdate(state, updateId);
    await saveMergedState(state);
    await callTelegram(token, "sendMessage", { chat_id: chat.id, text: "כתבו הוצאה במילים חופשיות, למשל: קפה 42 באשראי. אם חסר פרט, אפשר לשלוח אותו בהודעה הבאה. לביטול כתבו /cancel." });
    return reply({ ok: true });
  }

  const combinedText = [state.pendingTelegramExpense?.text, text].filter(Boolean).join(" ").slice(-300);
  const amount = parseAmount(combinedText);
  const method = parseMethod(combinedText);
  if (!amount || !method) {
    state.pendingTelegramExpense = { text: combinedText };
    rememberUpdate(state, updateId);
    await saveMergedState(state);
    const missing = !amount && !method ? "סכום ואמצעי תשלום" : !amount ? "סכום" : "אמצעי תשלום: מזומן, דיירקט או אשראי";
    await callTelegram(token, "sendMessage", { chat_id: chat.id, text: `לא רשמתי עדיין. חסר ${missing}. אפשר לשלוח עכשיו רק את הפרט שחסר, למשל: 42 או באשראי. לביטול כתבו /cancel.` });
    return reply({ ok: true, needsDetails: true });
  }

  const date = expenseDate(combinedText);
  const category = parseCategory(combinedText);
  const name = expenseName(combinedText) || categories[category];
  const expense = {
    id: `telegram-${updateId}`,
    type: "expense",
    name,
    amount,
    category,
    method,
    date,
    budgeted: true,
  };
  if (method === "credit") expense.creditDueDate = creditDueDate(date, state.settings);
  state.transactions.push(expense);
  state.pendingTelegramExpense = null;
  rememberUpdate(state, updateId);
  await saveMergedState(state);

  const methodNames = { cash: "מזומן", debit: "דיירקט", credit: "אשראי" };
  await callTelegram(token, "sendMessage", {
    chat_id: chat.id,
    text: `נרשם: ${amount} ₪ · ${name} · ${methodNames[method]} · ${date}${method === 'cash' ? ' · לא יורד מהמשכורת' : ''}`,
    reply_markup: { inline_keyboard: [[{ text: "↩ ביטול", callback_data: `undo:${expense.id}` }]] },
  });
  return reply({ ok: true });
    }
  }
  return reply({ error: "Budget is busy; retry update" }, 503);
};
}
export default createTelegramHandler();
