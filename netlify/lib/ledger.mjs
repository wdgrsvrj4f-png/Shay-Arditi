const monthPattern = /^\d{4}-\d{2}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const fundIds = new Set(["food","charge","hair","wash","kids","school-stuff","allowance","care","insurance","girls-clothes","gifts","my-clothes","health","gadgets","events","vacation","license","savings"]);
const methods = new Set(["debit", "credit", "cash"]);

export const emptyLedger = { salaries: {}, entries: [], moves: [], salaryHidden: {} };

function validMonth(value) {
  return typeof value === "string" && monthPattern.test(value) && !Number.isNaN(Date.parse(`${value}-01T00:00:00Z`));
}
function validDate(value) {
  return typeof value === "string" && datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}
function validAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000;
}
function validId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 80;
}

export function validateLedger(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const salaries = {};
  if (!value.salaries || typeof value.salaries !== "object" || Array.isArray(value.salaries)) return null;
  for (const [month, amount] of Object.entries(value.salaries)) {
    if (!validMonth(month) || !validAmount(amount)) return null;
    salaries[month] = Math.round(Number(amount) * 100) / 100;
  }
  if (!Array.isArray(value.entries) || value.entries.length > 5000) return null;
  if (!Array.isArray(value.moves) || value.moves.length > 5000) return null;
  const entries = [];
  for (const item of value.entries) {
    if (!item || !validId(item.id) || !validMonth(item.month) || !validDate(item.date)) return null;
    if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 80) return null;
    if (!validAmount(item.amount) || Number(item.amount) <= 0) return null;
    if (item.kind !== "luxury" && item.kind !== "fund") return null;
    if (!methods.has(item.method)) return null;
    if (item.kind === "fund" && !fundIds.has(item.fundId)) return null;
    entries.push({
      id: item.id,
      month: item.month,
      date: item.date,
      name: item.name.trim(),
      amount: Math.round(Number(item.amount) * 100) / 100,
      kind: item.kind,
      method: item.method,
      ...(item.kind === "fund" ? { fundId: item.fundId } : {}),
    });
  }
  const moves = [];
  for (const item of value.moves) {
    if (!item || !validId(item.id) || !validMonth(item.month) || !validDate(item.date)) return null;
    if (!fundIds.has(item.fundId) || !validAmount(item.amount) || Number(item.amount) <= 0) return null;
    moves.push({
      id: item.id,
      month: item.month,
      date: item.date,
      fundId: item.fundId,
      amount: Math.round(Number(item.amount) * 100) / 100,
    });
  }
  const salaryHidden = {};
  const hidden = value.salaryHidden && typeof value.salaryHidden === "object" ? value.salaryHidden : {};
  for (const [month, flag] of Object.entries(hidden)) {
    if (!validMonth(month) || flag !== true) return null;
    salaryHidden[month] = true;
  }
  if (new Set(entries.map((item) => item.id)).size !== entries.length) return null;
  if (new Set(moves.map((item) => item.id)).size !== moves.length) return null;
  return { salaries, entries, moves, salaryHidden };
}
