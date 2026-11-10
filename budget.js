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
  ["food", "מזון", 1000],
  ["charge", "חשמל", 200],
  ["hair", "תספורת", 80],
  ["wash", "שטיפה", 100],
  ["kids", "בננות", 400],
  ["school-stuff", "ציוד", 100],
  ["allowance", "דמ\"כ", 150],
  ["care", "טיפוח", 75],
  ["insurance", "ביטוח", 667],
  ["clothes", "ביגוד", 400],
  ["gifts", "מתנות", 150],
  ["health", "רפואה", 100],
  ["gadgets", "טכנולוגיה", 100],
  ["events", "אירועים", 100],
  ["vacation", "חופשה", 500],
  ["license", "טסט", 200],
  ["savings", "חיסכון", 500],
];
export const money = (n) => Math.round(n * 100) / 100;
const whole = (n) => String(Math.floor(n));
const owed = (n) => String(Math.ceil(n));
const sum = (rows) => money(rows.reduce((t, row) => t + row[2], 0));
export const FIXED_TOTAL = sum(FIXED);
export const FUND_TOTAL = sum(FUNDS);
export const LUXURY = money(INCOME - FIXED_TOTAL - FUND_TOTAL);
export function fundBucket(id) {
  return id === "girls-clothes" || id === "my-clothes" ? "clothes" : id;
}
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
        const id = fundBucket(entry.fundId);
        spent[id] = money((spent[id] ?? 0) + entry.amount);
      }
    }
    for (const move of ledger.moves) {
      if (move.month !== cursor) continue;
      const id = fundBucket(move.fundId);
      moved[id] = money((moved[id] ?? 0) + move.amount);
    }
    const funds = FUNDS.map(([id, name, monthly]) => {
      const left = money((carry[id] ?? 0) + monthly - (spent[id] ?? 0) - (moved[id] ?? 0));
      return { id, name, left };
    });
    const luxurySpent = money(ledger.entries.filter((entry) => entry.month === cursor && entry.kind === "luxury").reduce((t, entry) => t + entry.amount, 0));
    const luxuryMoved = money(ledger.moves.filter((move) => move.month === cursor).reduce((t, move) => t + move.amount, 0));
    const luxuryLeft = money(LUXURY + extra - debt + luxuryMoved - luxurySpent);
    if (cursor === month) {
      return { income, luxuryLeft, funds, fundsLeft: money(funds.reduce((t, fund) => t + fund.left, 0)), entries: ledger.entries.filter((entry) => entry.month === month), moves: ledger.moves.filter((move) => move.month === month) };
    }
    for (const fund of funds) carry[fund.id] = fund.left;
    if (luxuryLeft > 0) carry.savings = money((carry.savings ?? 0) + luxuryLeft);
    debt = luxuryLeft < 0 ? money(-luxuryLeft) : 0;
    cursor = shiftMonth(cursor, 1);
  }
  throw new Error("before origin");
}
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[char]);

function boot() {
  const root = document.querySelector("#app");
  const empty = { salaries: {}, entries: [], moves: [], salaryHidden: {} };
  let ledger = empty;
  let cloudError = false;
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  let month = now < ORIGIN ? ORIGIN : now;
  let open = false;
  let salaryOpen = false;
  let salaryDraft = "";
  let fundsOpen = true;
  let fixedOpen = false;
  let intro = true;
  const methods = { debit: "דיירקט", credit: "אשראי", cash: "מזומן" };
  const save = () => {
    fetch("/api/sync", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ledger }) })
      .then((response) => { cloudError = !response.ok; draw(); })
      .catch(() => { cloudError = true; draw(); });
  };
  const pull = () => {
    fetch("/api/sync").then((response) => { if (!response.ok) throw new Error("sync"); return response.json(); })
      .then((data) => { ledger = data.ledger || empty; cloudError = false; draw(); })
      .catch(() => { cloudError = true; draw(); });
  };
  function draw() {
    const view = viewMonth(ledger, month);
    const label = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00`));
    const amount = Math.floor(view.luxuryLeft);
    const play = intro;
    intro = false;
    root.innerHTML = `
      <header class="top"><div><h1>${label}</h1></div><div class="nav"><button type="button" data-act="prev" ${month <= ORIGIN ? "disabled" : ""} aria-label="חודש קודם">‹</button><button type="button" data-act="next" aria-label="חודש הבא">›</button></div></header>
      <section class="card center${play ? " till" : ""}">${play ? `<span class="slot"></span><span class="coin c1"></span><span class="coin c2"></span><span class="coin c3"></span>` : ""}<p class="hero ${view.luxuryLeft < 0 ? "bad" : ""}" dir="ltr">${play ? "0" : whole(view.luxuryLeft)}</p>${cloudError ? `<p class="muted">לא נשמר בענן</p>` : ""}<button type="button" class="add${play ? " hush" : ""}" data-act="add" aria-label="הוצאה">+</button></section>
      <div class="head"><h2>קרנות</h2><button type="button" class="fold" data-act="funds">${whole(view.fundsLeft)}</button></div>
      <section class="card rows slow${fundsOpen ? "" : " shut"}">${view.funds.map((fund) => `<div class="line"><span class="name">${esc(fund.name)}</span><b class="num ${fund.left < 0 ? "bad" : ""}" dir="ltr">${whole(fund.left)}</b></div>`).join("")}</section>
      <div class="head"><h2>הוצאות קבועות</h2><button type="button" class="fold" data-act="fixed">${owed(FIXED_TOTAL)}</button></div>
      <section class="card rows slow${fixedOpen ? "" : " shut"}">${FIXED.map((item) => `<div class="line"><span class="name">${esc(item[1])}</span><b class="num" dir="ltr">${owed(item[2])}</b></div>`).join("")}</section>
      ${ledger.salaryHidden[month] ? "" : `<section class="card">${salaryOpen ? `<input class="pay" id="salary" inputmode="decimal" placeholder="משכורת שנכנסה החודש" value="${esc(salaryDraft)}">` : `<button type="button" class="pay" data-act="salary">משכורת שנכנסה החודש</button>`}</section>`}
      <section class="card"><h2>מה נרשם החודש</h2>${view.entries.length === 0 ? `<p class="muted">עדיין אין הוצאות.</p>` : view.entries.map((entry) => `<div class="line"><span>${esc(entry.name)}<small>${entry.kind === "luxury" ? "מותרות" : esc(FUNDS.find((fund) => fund[0] === fundBucket(entry.fundId))?.[1] || "")} · ${methods[entry.method]}</small></span><b dir="ltr">${whole(entry.amount)}</b><button type="button" data-del="${esc(entry.id)}" aria-label="מחיקה">×</button></div>`).join("")}</section>
      ${open ? `<form class="sheet" id="expense"><h2>הוצאה</h2><input name="name" placeholder="על מה" required><input name="amount" inputmode="decimal" placeholder="סכום" required><select name="target"><option value="luxury">מותרות</option>${FUNDS.map((fund) => `<option value="${fund[0]}">${fund[1]}</option>`).join("")}</select><div class="methods">${["debit", "credit", "cash"].map((id) => `<button type="button" data-method="${id}" class="${(root.dataset.method || "debit") === id ? "on" : ""}">${methods[id]}</button>`).join("")}</div><p class="muted" id="method-note"></p><button class="round" type="submit">שמירה</button></form>` : ""}
    `;
    const notes = { debit: "האתר והבנק זזים היום.", credit: "האתר זז היום. הבנק זז רק ב־2, בלי להוריד שוב.", cash: "האתר זז היום. הבנק לא, כי השטר כבר יצא." };
    const note = root.querySelector("#method-note");
    if (note) note.textContent = notes[root.dataset.method || "debit"];
    const salary = root.querySelector("#salary");
    if (salary) salary.focus();
    if (play) {
      const hero = root.querySelector(".hero");
      const card = root.querySelector(".card.center");
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 3000);
        if (hero) hero.textContent = String(t >= 1 ? amount : Math.floor(amount * t));
        if (t < 1) requestAnimationFrame(tick);
        else card?.classList.add("grow");
      };
      requestAnimationFrame(tick);
      card?.addEventListener("animationend", (event) => { if (event.animationName === "grow") card.classList.remove("till", "grow"); });
    }
  }
  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-act],[data-del],[data-method]");
    if (!target) return;
    let changed = false;
    if (target.dataset.act === "prev" && month > ORIGIN) month = shiftMonth(month, -1);
    if (target.dataset.act === "next") month = shiftMonth(month, 1);
    if (target.dataset.act === "add") open = true;
    if (target.dataset.act === "salary") salaryOpen = true;
    if (target.dataset.act === "funds") fundsOpen = !fundsOpen;
    if (target.dataset.act === "fixed") fixedOpen = !fixedOpen;
    if (target.dataset.del) { ledger.entries = ledger.entries.filter((entry) => entry.id !== target.dataset.del); changed = true; }
    if (target.dataset.method) root.dataset.method = target.dataset.method;
    if (changed) save();
    else draw();
  });
  root.addEventListener("input", (event) => { if (event.target.id === "salary") salaryDraft = event.target.value; });
  root.addEventListener("focusout", (event) => {
    if (event.target.id !== "salary") return;
    salaryOpen = false;
    const value = money(Number(salaryDraft));
    if (salaryDraft.trim() && Number.isFinite(value) && value >= 0) {
      ledger.salaries[month] = value;
      ledger.salaryHidden[month] = true;
      salaryDraft = "";
      save();
    } else draw();
  });
  root.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    const amount = money(Number(data.get("amount")));
    const name = String(data.get("name") || "").trim();
    const where = String(data.get("target"));
    if (!name || amount <= 0) return;
    ledger.entries.unshift({ id: crypto.randomUUID(), month, date: `${month}-15`, name, amount, kind: where === "luxury" ? "luxury" : "fund", fundId: where === "luxury" ? undefined : where, method: root.dataset.method || "debit" });
    open = false;
    save();
  });
  draw();
  pull();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pull(); });
}
if (typeof document !== "undefined") boot();
