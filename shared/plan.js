export const INCOME = 12500;

export const LOCKED = [
  { id: 'pepper', name: 'הלוואת Pepper', amount: 2497.92 },
  { id: 'tesla-loan', name: 'הלוואת טסלה', amount: 1800 },
  { id: 'yotam', name: 'הלוואת יותם', amount: 1533.83 },
  { id: 'school', name: 'בית ספר לבנות', amount: 900 },
  { id: 'gym', name: 'חדר כושר', amount: 200 },
  { id: 'phone', name: 'פלאפון', amount: 79.69 },
  { id: 'spotify', name: 'Spotify', amount: 23.9 },
];

export const KEPT = [
  { id: 'food', name: 'אוכל בסיסי', amount: 1000, sink: false },
  { id: 'charge', name: 'טעינת הרכב', amount: 200, sink: false },
  { id: 'hair', name: 'תספורות', amount: 80, sink: false },
  { id: 'insurance', name: 'ביטוח רכב', amount: 667, sink: true },
  { id: 'wash', name: 'שטיפת רכב', amount: 100, sink: false },
  { id: 'girls-clothes', name: 'בגדים ונעליים לבנות', amount: 300, sink: true },
  { id: 'gifts', name: 'ימי הולדת ומתנות', amount: 150, sink: true },
  { id: 'kids', name: 'טיולים עם הבנות', amount: 400, sink: false },
  { id: 'school-stuff', name: 'ציוד וחוגים', amount: 100, sink: false },
  { id: 'allowance', name: 'דמי כיס', amount: 150, sink: false },
  { id: 'my-clothes', name: 'בגדים ונעליים לעצמי', amount: 100, sink: true },
  { id: 'care', name: 'טיפוח והיגיינה', amount: 75, sink: false },
  { id: 'health', name: 'תרופות ורופא שיניים', amount: 100, sink: true },
  { id: 'gadgets', name: 'גאדג׳טים ואביזרים', amount: 100, sink: true },
  { id: 'events', name: 'אירועים וחתונות', amount: 100, sink: true },
  { id: 'vacation', name: 'חופשות', amount: 500, sink: true },
  { id: 'license', name: 'טסט ואגרת רישוי', amount: 200, sink: true },
];

const RULES = [
  ['pepper', /פפר|pepper/i],
  ['tesla-loan', /הלוואת טסלה|מימון טסלה/],
  ['yotam', /יותם/],
  ['school', /בית ספר|שכר לימוד/],
  ['gym', /חדר כושר|כושר|מנוי ספורט/],
  ['spotify', /ספוטיפיי|spotify/i],
  ['phone', /פלאפון|סלקום|פרטנר|פלא.פון/],
  ['license', /טסט|אגרת רישוי|רישיון רכב/],
  ['insurance', /ביטוח/],
  ['wash', /שטיפ/],
  ['vacation', /חופש|נופש|צימר|מלון|טיסה/],
  ['kids', /אטרקצ|גן חיות|לונה פארק/],
  ['gifts', /יום הולדת|מתנה/],
  ['events', /חתונ|אירוע/],
  ['allowance', /דמי כיס/],
  ['school-stuff', /חוג|ציוד לבית הספר/],
  ['girls-clothes', /לבנות|של הבנות/],
  ['hair', /תספורת|מספרה/],
  ['gadgets', /גאדג|אוזניות/],
  ['care', /טיפוח|היגיינה|שמפו/],
  ['health', /תרופ|שיניים|רופא/],
  ['my-clothes', /בגדים|נעליים/],
  ['charge', /טעינ|דלק|פנגו|סונול|פז /],
  ['food', /סופר|מרכול|שופרסל|רמי לוי|יוחננוף|ויקטורי|מכולת/],
];

const CATEGORY_PLAN = { groceries: 'food', fuel: 'charge', health: 'health' };
const IDS = new Set(['free', ...LOCKED.map(item => item.id), ...KEPT.map(item => item.id)]);

export function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function sum(items, key = 'amount') {
  return money(items.reduce((total, item) => total + Number(item[key] || 0), 0));
}

export function planWindow(year, month) {
  const last = new Date(year, month, 0).getDate();
  const pad = value => String(value).padStart(2, '0');
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(last)}`, factor: 1, partial: false };
}

export function classifyExpense(expense) {
  if (IDS.has(expense?.plan)) return expense.plan;
  const name = String(expense?.name || '');
  for (const [id, pattern] of RULES) if (pattern.test(name)) return id;
  return CATEGORY_PLAN[expense?.category] || 'free';
}

function inWindow(date, window) {
  return date >= window.start && date <= window.end;
}

function daysInclusive(start, end) {
  const from = Date.parse(`${start}T12:00:00Z`);
  const to = Date.parse(`${end}T12:00:00Z`);
  return Math.max(1, Math.round((to - from) / 86400000) + 1);
}

function earlierMonths(year, month) {
  const months = [];
  let cursorYear = 2026;
  let cursorMonth = 11;
  while (cursorYear < year || (cursorYear === year && cursorMonth < month)) {
    months.push([cursorYear, cursorMonth]);
    cursorMonth += 1;
    if (cursorMonth === 13) { cursorMonth = 1; cursorYear += 1; }
  }
  return months;
}

function spentByPlan(transactions, window) {
  const spent = {};
  const rows = [];
  for (const item of transactions || []) {
    if (item?.type !== 'expense' || !inWindow(item.date, window)) continue;
    const plan = classifyExpense(item);
    spent[plan] = money((spent[plan] || 0) + Number(item.amount));
    rows.push({ id: item.id, name: item.name, amount: money(item.amount), date: item.date, method: item.method, plan });
  }
  rows.sort((a, b) => a.date < b.date ? 1 : -1);
  return { spent, rows };
}

export function summarize(transactions, todayISO) {
  const [year, month] = todayISO.split('-').map(Number);
  const window = planWindow(year, month);
  const lockedSum = sum(LOCKED);
  const keptSum = sum(KEPT);
  const freeFull = money(INCOME - lockedSum - keptSum);
  const freeBudget = money(freeFull * window.factor);
  const { spent, rows } = spentByPlan(transactions, window);
  const lines = [...LOCKED, ...KEPT].map(item => {
    const budget = money(item.amount * window.factor);
    const used = money(spent[item.id] || 0);
    return { ...item, budget, used, left: money(budget - used) };
  });
  let reserve = 0;
  const pots = {};
  for (const [pastYear, pastMonth] of earlierMonths(year, month)) {
    const past = planWindow(pastYear, pastMonth);
    const pastSpent = spentByPlan(transactions, past).spent;
    const pastFree = money(freeFull * past.factor);
    reserve = money(reserve + Math.max(0, pastFree - (pastSpent.free || 0)));
    for (const item of KEPT.filter(entry => entry.sink)) {
      const budget = money(item.amount * past.factor);
      pots[item.id] = money((pots[item.id] || 0) + budget - (pastSpent[item.id] || 0));
    }
  }
  const freeSpent = money(spent.free || 0);
  const freeLeft = money(freeBudget - freeSpent);
  const started = todayISO >= window.start;
  const paceStart = started ? todayISO : window.start;
  const daysLeft = daysInclusive(paceStart, window.end);
  const over = lines.filter(item => item.left < 0);
  return {
    income: INCOME, window, lockedSum, keptSum, freeFull, freeBudget, freeSpent, freeLeft,
    daily: money(freeLeft / daysLeft), weekly: money(freeLeft / daysLeft * 7), daysLeft, started,
    lines, rows, reserve, pots, over: over.map(item => item.id),
    sunday: new Date(`${todayISO}T12:00:00Z`).getUTCDay() === 0,
  };
}

export function previewSpend(summary, amount) {
  const cost = Math.max(0, Number(amount) || 0);
  const after = money(summary.freeLeft - cost);
  return { after, daily: money(after / summary.daysLeft), ok: after >= 0, heavy: cost > summary.weekly && after >= 0 };
}
