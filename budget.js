export const INCOME = 12500;
export const ORIGIN = "2026-11";
export const FIXED = [
  ["pepper", "הלוואת Pepper", 2497.92],
  ["tesla", "הלוואת טסלה", 1800],
  ["yotam", "הלוואת יותם", 1533.83],
  ["school", "בית ספר לבנות", 900],
  ["gym", "חדר כושר", 200],
  ["phone", "פלאפון", 79.69],
  ["spotify", "Spotify", 23.9],
];
export const FUNDS = [
  ["food", "אוכל בסיסי", 1000],
  ["charge", "טעינת הרכב", 200],
  ["hair", "תספורות", 80],
  ["wash", "שטיפת רכב", 100],
  ["kids", "טיולים עם הבנות", 400],
  ["school-stuff", "ציוד וחוגים", 100],
  ["allowance", "דמי כיס", 150],
  ["care", "טיפוח", 75],
  ["insurance", "ביטוח רכב", 667],
  ["girls-clothes", "בגדים לבנות", 300],
  ["gifts", "מתנות", 150],
  ["my-clothes", "בגדים שלך", 100],
  ["health", "תרופות ושיניים", 100],
  ["gadgets", "גאדג׳טים", 100],
  ["events", "אירועים", 100],
  ["vacation", "חופשות", 500],
  ["license", "טסט ורישוי", 200],
  ["savings", "חיסכון", 500],
];
export const money = (n) => Math.round(n * 100) / 100;
const sum = (rows) => money(rows.reduce((t, row) => t + row[2], 0));
export const FIXED_TOTAL = sum(FIXED);
export const FUND_TOTAL = sum(FUNDS);
export const LUXURY = money(INCOME - FIXED_TOTAL - FUND_TOTAL);

export function shiftMonth(month, delta) {
  const [year, raw] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, raw - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function viewMonth(ledger, month) {
  const carry = {};
  let debt = 0;
  let cursor = ORIGIN;
  while (cursor <= month) {
    const income = ledger.salaries[cursor] ?? INCOME;
    const extra = money(income - INCOME);
    const spent = {};
    const moved = {};
    for (const entry of ledger.entries) {
      if (entry.month === cursor && entry.kind === "fund" && entry.fundId) {
        spent[entry.fundId] = money((spent[entry.fundId] ?? 0) + entry.amount);
      }
    }
    for (const move of ledger.moves) {
      if (move.month === cursor) moved[move.fundId] = money((moved[move.fundId] ?? 0) + move.amount);
    }
    const funds = FUNDS.map(([id, name, monthly]) => {
      const carried = money(carry[id] ?? 0);
      const used = money(spent[id] ?? 0);
      const movedOut = money(moved[id] ?? 0);
      return { id, name, carried, spent: used, moved: movedOut, left: money(carried + monthly - used - movedOut) };
    });
    const luxurySpent = money(
      ledger.entries.filter((entry) => entry.month === cursor && entry.kind === "luxury").reduce((t, entry) => t + entry.amount, 0),
    );
    const luxuryMoved = money(ledger.moves.filter((move) => move.month === cursor).reduce((t, move) => t + move.amount, 0));
    const luxuryBudget = money(LUXURY + extra - debt);
    const luxuryLeft = money(luxuryBudget + luxuryMoved - luxurySpent);
    if (cursor === month) {
      return {
        income,
        luxuryLeft,
        funds,
        fundsLeft: money(funds.reduce((t, fund) => t + fund.left, 0)),
        entries: ledger.entries.filter((entry) => entry.month === month),
        moves: ledger.moves.filter((move) => move.month === month),
      };
    }
    for (const fund of funds) carry[fund.id] = fund.left;
    if (luxuryLeft > 0) carry.savings = money((carry.savings ?? 0) + luxuryLeft);
    debt = luxuryLeft < 0 ? money(-luxuryLeft) : 0;
    cursor = shiftMonth(cursor, 1);
  }
  throw new Error("before origin");
}

const shekel = (value) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(value);
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&" + "amp;",
  "<": "&" + "lt;",
  ">": "&" + "gt;",
  '"': "&" + "quot;",
  "'": "&" + "#39;",
})[char]);

function boot() {
  const root = document.querySelector("#app");
  const key = "budget-logic-v1";
  let ledger = { salaries: {}, entries: [], moves: [], salaryHidden: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved?.entries && saved?.moves) ledger = { salaries: saved.salaries || {}, entries: saved.entries, moves: saved.moves, salaryHidden: saved.salaryHidden || {} };
  } catch { /* empty */ }
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  let month = now < ORIGIN ? ORIGIN : now;
  let open = false;
  let salaryOpen = false;
  let salaryDraft = "";
  let moveFund = null;
  let moveDraft = "";
  const save = () => localStorage.setItem(key, JSON.stringify(ledger));
  const methods = { debit: "דיירקט", credit: "אשראי", cash: "מזומן" };

  function draw() {
    const view = viewMonth(ledger, month);
    const label = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00`));
    root.innerHTML = `
      <header class="top">
        <div><p class="muted">התקציב של החודש</p><h1>${label}</h1></div>
        <div class="nav">
          <button type="button" data-act="prev" ${month <= ORIGIN ? "disabled" : ""} aria-label="חודש קודם">›</button>
          <button type="button" data-act="next" aria-label="חודש הבא">‹</button>
        </div>
      </header>
      <section class="card center">
        <p class="hero ${view.luxuryLeft < 0 ? "bad" : ""}">${shekel(view.luxuryLeft)}</p>
        <button type="button" class="round" data-act="add">+ הוצאה</button>
      </section>
      ${ledger.salaryHidden[month] ? "" : `<section class="card">${salaryOpen ? `<input id="salary" inputmode="decimal" placeholder="משכורת שנכנסה החודש" value="${esc(salaryDraft)}">` : `<button type="button" class="field" data-act="salary">משכורת שנכנסה החודש</button>`}</section>`}
      <section class="card">
        <div class="row"><h2>קרנות</h2><b class="sand">${shekel(view.fundsLeft)}</b></div>
        ${view.funds.map((fund) => `<div class="line"><span>${fund.name}</span><span class="end"><b class="${fund.left < 0 ? "bad" : ""}">${shekel(fund.left)}</b><button type="button" data-move="${fund.id}">למותרות</button></span></div>`).join("")}
      </section>
      <section class="card">
        <div class="row"><h2>הוצאות קבועות</h2><span class="muted">${shekel(FIXED_TOTAL)}</span></div>
        ${FIXED.map((item) => `<div class="line"><span>${item[1]}</span><span class="muted">${shekel(item[2])}</span></div>`).join("")}
      </section>
      <section class="card">
        <h2>מה נרשם החודש</h2>
        ${view.entries.length + view.moves.length === 0 ? `<p class="muted">עדיין אין הוצאות.</p>` : `${view.moves.map((move) => `<p class="muted">הועברו ${shekel(move.amount)} מ${esc(FUNDS.find((fund) => fund[0] === move.fundId)?.[1] || "")} למותרות</p>`).join("")}${view.entries.map((entry) => `<div class="line"><span>${esc(entry.name)}<small>${entry.kind === "luxury" ? "מותרות" : esc(FUNDS.find((fund) => fund[0] === entry.fundId)?.[1] || "")} · ${methods[entry.method]}</small></span><span class="end"><b>${shekel(entry.amount)}</b><button type="button" data-del="${esc(entry.id)}" aria-label="מחיקה">×</button></span></div>`).join("")}`}
      </section>
      ${open ? `<form class="sheet" id="expense"><h2>הוצאה</h2><input name="name" placeholder="על מה" required><input name="amount" inputmode="decimal" placeholder="סכום" required><select name="target"><option value="luxury">מותרות</option>${FUNDS.map((fund) => `<option value="${fund[0]}">${fund[1]}</option>`).join("")}</select><div class="methods">${["debit", "credit", "cash"].map((id) => `<button type="button" data-method="${id}" class="${(root.dataset.method || "debit") === id ? "on" : ""}">${methods[id]}</button>`).join("")}</div><p class="muted" id="method-note"></p><button class="round" type="submit">שמירה</button></form>` : ""}
      ${moveFund ? `<form class="sheet" id="move"><h2>העברה</h2><input name="amount" inputmode="decimal" placeholder="סכום" required><div class="pair"><button type="button" data-act="close-move">ביטול</button><button class="round" type="submit">העברה</button></div></form>` : ""}
    `;
    const notes = { debit: "האתר והבנק זזים היום.", credit: "האתר זז היום. הבנק זז רק ב־2, בלי להוריד שוב.", cash: "האתר זז היום. הבנק לא, כי השטר כבר יצא." };
    const note = root.querySelector("#method-note");
    if (note) note.textContent = notes[root.dataset.method || "debit"];
    const salary = root.querySelector("#salary");
    if (salary) salary.focus();
  }

  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-act],[data-move],[data-del],[data-method]");
    if (!target) return;
    if (target.dataset.act === "prev") month = shiftMonth(month, -1);
    if (target.dataset.act === "next") month = shiftMonth(month, 1);
    if (target.dataset.act === "add") open = true;
    if (target.dataset.act === "salary") salaryOpen = true;
    if (target.dataset.act === "close-move") moveFund = null;
    if (target.dataset.move) { moveFund = target.dataset.move; moveDraft = ""; }
    if (target.dataset.del) ledger.entries = ledger.entries.filter((entry) => entry.id !== target.dataset.del);
    if (target.dataset.method) root.dataset.method = target.dataset.method;
    save();
    draw();
  });
  root.addEventListener("input", (event) => {
    if (event.target.id === "salary") salaryDraft = event.target.value;
  });
  root.addEventListener("focusout", (event) => {
    if (event.target.id !== "salary") return;
    salaryOpen = false;
    const value = money(Number(salaryDraft));
    if (salaryDraft.trim() && Number.isFinite(value) && value >= 0) {
      ledger.salaries[month] = value;
      ledger.salaryHidden[month] = true;
      salaryDraft = "";
    }
    save();
    draw();
  });
  root.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    if (event.target.id === "expense") {
      const amount = money(Number(data.get("amount")));
      const name = String(data.get("name") || "").trim();
      const where = String(data.get("target"));
      if (!name || amount <= 0) return;
      ledger.entries.unshift({ id: crypto.randomUUID(), month, date: `${month}-15`, name, amount, kind: where === "luxury" ? "luxury" : "fund", fundId: where === "luxury" ? undefined : where, method: root.dataset.method || "debit" });
      open = false;
    }
    if (event.target.id === "move") {
      const amount = money(Number(data.get("amount")));
      const available = viewMonth(ledger, month).funds.find((fund) => fund.id === moveFund)?.left ?? 0;
      if (amount <= 0 || amount > available) return;
      ledger.moves.unshift({ id: crypto.randomUUID(), month, date: `${month}-01`, fundId: moveFund, amount });
      moveFund = null;
    }
    save();
    draw();
  });
  draw();
}

if (typeof document !== "undefined") boot();
