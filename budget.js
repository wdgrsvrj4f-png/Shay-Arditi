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
const LOGOS = {"food":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-utensils-crossed logo\" aria-hidden=\"true\"><path d=\"m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8\"></path><path d=\"M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7\"></path><path d=\"m2.1 21.8 6.4-6.3\"></path><path d=\"m19 5-7 7\"></path></svg>","charge":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-zap logo\" aria-hidden=\"true\"><path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\"></path></svg>","hair":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-scissors logo\" aria-hidden=\"true\"><circle cx=\"6\" cy=\"6\" r=\"3\"></circle><path d=\"M8.12 8.12 12 12\"></path><path d=\"M20 4 8.12 15.88\"></path><circle cx=\"6\" cy=\"18\" r=\"3\"></circle><path d=\"M14.8 14.8 20 20\"></path></svg>","wash":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-car-front logo\" aria-hidden=\"true\"><path d=\"m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8\"></path><path d=\"M7 14h.01\"></path><path d=\"M17 14h.01\"></path><rect width=\"18\" height=\"8\" x=\"3\" y=\"10\" rx=\"2\"></rect><path d=\"M5 18v2\"></path><path d=\"M19 18v2\"></path></svg>","kids":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-ferris-wheel logo\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"2\"></circle><path d=\"M12 2v4\"></path><path d=\"m6.8 15-3.5 2\"></path><path d=\"m20.7 7-3.5 2\"></path><path d=\"M6.8 9 3.3 7\"></path><path d=\"m20.7 17-3.5-2\"></path><path d=\"m9 22 3-8 3 8\"></path><path d=\"M8 22h8\"></path><path d=\"M18 18.7a9 9 0 1 0-12 0\"></path></svg>","school-stuff":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-backpack logo\" aria-hidden=\"true\"><path d=\"M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z\"></path><path d=\"M8 10h8\"></path><path d=\"M8 18h8\"></path><path d=\"M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6\"></path><path d=\"M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2\"></path></svg>","allowance":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-coins logo\" aria-hidden=\"true\"><circle cx=\"8\" cy=\"8\" r=\"6\"></circle><path d=\"M18.09 10.37A6 6 0 1 1 10.34 18\"></path><path d=\"M7 6h1v4\"></path><path d=\"m16.71 13.88.7.71-2.82 2.82\"></path></svg>","care":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-sparkles logo\" aria-hidden=\"true\"><path d=\"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z\"></path><path d=\"M20 3v4\"></path><path d=\"M22 5h-4\"></path><path d=\"M4 17v2\"></path><path d=\"M5 18H3\"></path></svg>","insurance":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-shield logo\" aria-hidden=\"true\"><path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"></path></svg>","clothes":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-shirt logo\" aria-hidden=\"true\"><path d=\"M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z\"></path></svg>","gifts":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-gift logo\" aria-hidden=\"true\"><rect x=\"3\" y=\"8\" width=\"18\" height=\"4\" rx=\"1\"></rect><path d=\"M12 8v13\"></path><path d=\"M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7\"></path><path d=\"M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5\"></path></svg>","health":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-pill logo\" aria-hidden=\"true\"><path d=\"m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z\"></path><path d=\"m8.5 8.5 7 7\"></path></svg>","gadgets":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-smartphone logo\" aria-hidden=\"true\"><rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\"></rect><path d=\"M12 18h.01\"></path></svg>","events":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-calendar logo\" aria-hidden=\"true\"><path d=\"M8 2v4\"></path><path d=\"M16 2v4\"></path><rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\"></rect><path d=\"M3 10h18\"></path></svg>","vacation":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-sun logo\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"4\"></circle><path d=\"M12 2v2\"></path><path d=\"M12 20v2\"></path><path d=\"m4.93 4.93 1.41 1.41\"></path><path d=\"m17.66 17.66 1.41 1.41\"></path><path d=\"M2 12h2\"></path><path d=\"M20 12h2\"></path><path d=\"m6.34 17.66-1.41 1.41\"></path><path d=\"m19.07 4.93-1.41 1.41\"></path></svg>","license":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-id-card logo\" aria-hidden=\"true\"><path d=\"M16 10h2\"></path><path d=\"M16 14h2\"></path><path d=\"M6.17 15a3 3 0 0 1 5.66 0\"></path><circle cx=\"9\" cy=\"11\" r=\"2\"></circle><rect x=\"2\" y=\"5\" width=\"20\" height=\"14\" rx=\"2\"></rect></svg>","savings":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-piggy-bank logo\" aria-hidden=\"true\"><path d=\"M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z\"></path><path d=\"M16 10h.01\"></path><path d=\"M2 8v1a2 2 0 0 0 2 2h1\"></path></svg>"};
export const money = (n) => Math.round(n * 100) / 100;
const shown = (n) => String(Math.round(n * 100) / 100);
const whole = (n) => String(Math.floor(n));
const owed = (n) => String(Math.ceil(n));
const sum = (rows) => money(rows.reduce((t, row) => t + row[2], 0));
export const FIXED_TOTAL = sum(FIXED);
export const FUND_TOTAL = sum(FUNDS);
export const LUXURY = money(INCOME - FIXED_TOTAL - FUND_TOTAL);
export function fundBucket(id) { return id === "girls-clothes" || id === "my-clothes" ? "clothes" : id; }
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
    const funds = FUNDS.map(([id, name, monthly]) => ({ id, name, left: money((carry[id] ?? 0) + monthly - (spent[id] ?? 0) - (moved[id] ?? 0)) }));
    const luxurySpent = money(ledger.entries.filter((entry) => entry.month === cursor && entry.kind === "luxury").reduce((t, entry) => t + entry.amount, 0));
    const luxuryMoved = money(ledger.moves.filter((move) => move.month === cursor).reduce((t, move) => t + move.amount, 0));
    const luxuryLeft = money(LUXURY + extra - debt + luxuryMoved - luxurySpent);
    if (cursor === month) return { luxuryLeft, funds, entries: ledger.entries.filter((entry) => entry.month === month), moves: ledger.moves.filter((move) => move.month === month) };
    for (const fund of funds) carry[fund.id] = fund.left;
    if (luxuryLeft > 0) carry.savings = money((carry.savings ?? 0) + luxuryLeft);
    debt = luxuryLeft < 0 ? money(-luxuryLeft) : 0;
    cursor = shiftMonth(cursor, 1);
  }
  throw new Error("before origin");
}
const esc = (value) => String(value).replace(/[&<>\"']/g, (char) => ({ "&": "&", "<": "<", ">": ">", '\"': """, "'": "&#39;" })[char]);
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
  let phase = "run";
  const methods = { debit: "דיירקט", credit: "אשראי", cash: "מזומן" };
  const notes = { debit: "האתר והבנק זזים היום.", credit: "האתר זז היום. הבנק זז רק ב־2, בלי להוריד שוב.", cash: "האתר זז היום. הבנק לא, כי השטר כבר יצא." };
  const save = () => fetch("/api/sync", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ledger }) }).then((response) => { cloudError = !response.ok; if (phase === "done") draw(); }).catch(() => { cloudError = true; if (phase === "done") draw(); });
  function draw() {
    const view = viewMonth(ledger, month);
    const label = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(month + "-01T00:00:00"));
    const amount = Math.floor(view.luxuryLeft);
    const cardClass = phase === "done" ? "card center" : phase === "grow" ? "card center till grow" : "card center till";
    const fundTotal = view.funds.reduce((total, fund) => total + Math.floor(fund.left), 0);
    const fixedTotal = FIXED.reduce((total, item) => total + Math.ceil(item[2]), 0);
    root.innerHTML = `
      <header class="top"><div><h1>${label}</h1></div><div class="nav"><button type="button" data-act="prev" ${month <= ORIGIN ? "disabled" : ""} aria-label="חודש קודם">‹</button><button type="button" data-act="next" aria-label="חודש הבא">›</button></div></header>
      <section class="${cardClass}">${phase === "done" ? "" : '<span class="slot"></span><span class="coin c1"></span><span class="coin c2"></span><span class="coin c3"></span>'}<p class="hero ${view.luxuryLeft < 0 ? "bad" : ""}" dir="ltr">${phase === "done" ? whole(view.luxuryLeft) : "0"}</p>${cloudError ? '<p class="muted">לא נשמר בענן</p>' : ""}<button type="button" class="${phase === "done" ? "add" : "add hush"}" data-act="add" aria-label="הוצאה">+</button></section>
      <div class="head"><button type="button" class="fold" data-act="funds" aria-expanded="${fundsOpen}"><h2>קרנות</h2></button><b class="num" dir="ltr">${fundTotal}</b></div>
      <section class="card rows slow${fundsOpen ? "" : " shut"}">${view.funds.map((fund) => `<div class="line"><span class="name">${LOGOS[fund.id] || ""}${esc(fund.name)}</span><b class="num${fund.left < 0 ? " bad" : ""}" dir="ltr">${whole(fund.left)}</b></div>`).join("")}</section>
      <div class="head"><button type="button" class="fold" data-act="fixed" aria-expanded="${fixedOpen}"><h2>הוצאות קבועות</h2></button><b class="num" dir="ltr">${fixedTotal}</b></div>
      <section class="card rows slow${fixedOpen ? "" : " shut"}">${FIXED.map((item) => `<div class="line"><span class="name">${esc(item[1])}</span><b class="num" dir="ltr">${owed(item[2])}</b></div>`).join("")}</section>
      <section class="card note"><h2>מה נרשם החודש</h2>${view.entries.length + view.moves.length === 0 ? '<p class="muted">עדיין אין הוצאות.</p>' : `${view.moves.map((move) => `<p class="muted">הועברו ${shown(move.amount)} מ${esc(FUNDS.find((fund) => fund[0] === fundBucket(move.fundId))?.[1] || "")} למותרות</p>`).join("")}${view.entries.map((entry) => `<div class="line"><span>${esc(entry.name)}<small>${entry.kind === "luxury" ? "מותרות" : esc(FUNDS.find((fund) => fund[0] === fundBucket(entry.fundId))?.[1] || "")} · ${methods[entry.method]}</small></span><span class="end"><b>${shown(entry.amount)}</b><button type="button" data-del="${esc(entry.id)}" aria-label="מחיקה">×</button></span></div>`).join("")}`}</section>
      ${ledger.salaryHidden[month] ? "" : `<section class="card">${salaryOpen ? `<input class="pay" id="salary" inputmode="decimal" placeholder="משכורת שנכנסה החודש" value="${esc(salaryDraft)}">` : '<button type="button" class="pay" data-act="salary">משכורת שנכנסה החודש</button>'}</section>`}
      ${open ? `<form class="sheet" id="expense"><h2>הוצאה</h2><input name="name" placeholder="על מה" required><input name="amount" inputmode="decimal" placeholder="סכום" required><select name="target"><option value="luxury">מותרות</option>${FUNDS.map((fund) => `<option value="${fund[0]}">${fund[1]}</option>`).join("")}</select><div class="methods">${["debit","credit","cash"].map((id) => `<button type="button" data-method="${id}" class="${(root.dataset.method || "debit") === id ? "on" : ""}">${methods[id]}</button>`).join("")}</div><p class="muted" id="method-note"></p><button class="round" type="submit">שמירה</button></form>` : ""}
    `;
    const note = root.querySelector("#method-note");
    if (note) note.textContent = notes[root.dataset.method || "debit"];
    root.querySelector("#salary")?.focus();
    if (phase === "run") {
      const hero = root.querySelector(".hero");
      const card = root.querySelector(".card.center");
      const start = performance.now();
      const tick = (time) => {
        if (phase !== "run" && phase !== "grow") return;
        const t = Math.min(1, (time - start) / 3000);
        if (hero) hero.textContent = String(t >= 1 ? amount : Math.floor(amount * t));
        if (t < 1) requestAnimationFrame(tick);
        else { phase = "grow"; card?.classList.add("grow"); }
      };
      requestAnimationFrame(tick);
      card?.addEventListener("animationend", (event) => {
        if (event.animationName !== "grow") return;
        phase = "done";
        draw();
      });
    }
  }
  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-act],[data-del],[data-method]");
    if (!target || phase !== "done") return;
    let changed = false;
    if (target.dataset.act === "prev" && month > ORIGIN) month = shiftMonth(month, -1);
    if (target.dataset.act === "next") month = shiftMonth(month, 1);
    if (target.dataset.act === "add") open = !open;
    if (target.dataset.act === "salary") salaryOpen = true;
    if (target.dataset.act === "funds") fundsOpen = !fundsOpen;
    if (target.dataset.act === "fixed") fixedOpen = !fixedOpen;
    if (target.dataset.del) { ledger.entries = ledger.entries.filter((entry) => entry.id !== target.dataset.del); changed = true; }
    if (target.dataset.method) root.dataset.method = target.dataset.method;
    if (changed) save(); else draw();
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
    ledger.entries.unshift({ id: crypto.randomUUID(), month, date: month + "-15", name, amount, kind: where === "luxury" ? "luxury" : "fund", fundId: where === "luxury" ? undefined : where, method: root.dataset.method || "debit" });
    open = false;
    save();
  });
  fetch("/api/sync").then((response) => { if (!response.ok) throw new Error("sync"); return response.json(); }).then((data) => { ledger = data.ledger || empty; }).catch(() => { cloudError = true; }).finally(draw);
}
if (typeof document !== "undefined") boot();
