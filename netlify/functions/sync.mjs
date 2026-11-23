import { requireAuth } from "../lib/auth.mjs";
import { readJSON, reply } from "../lib/http.mjs";
import { emptyLedger, validateLedger } from "../lib/ledger.mjs";
import { budgetStore, readSnapshot } from "../lib/store.mjs";
import { publicState } from "./budget.mjs";

const ledgerKey = "screen-ledger";
const planKey = "screen-plan";

function isPlan(value) {
  if (!value || typeof value !== "object") return false;
  const rows = (items) => Array.isArray(items) && items.every((item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.amount === "number");
  return typeof value.income === "number" && rows(value.fixed) && rows(value.funds);
}

async function snapshot(store) {
  const saved = await store.get(ledgerKey, { type: "json", consistency: "strong" });
  const ledger = validateLedger(saved) || emptyLedger;
  const storedPlan = await store.get(planKey, { type: "json", consistency: "strong" });
  const { data } = await readSnapshot(store);
  return { ledger, legacy: publicState(data), plan: isPlan(storedPlan) ? storedPlan : null };
}

export default async function handler(request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  if (!["GET", "PUT"].includes(request.method)) return reply({ error: "Method not allowed" }, 405);
  try {
    const store = await budgetStore();
    if (request.method === "GET") return reply(await snapshot(store));
    const body = await readJSON(request, 1_000_000);
    const ledger = validateLedger(body?.ledger);
    if (!ledger) return reply({ error: "Invalid ledger" }, 400);
    await store.setJSON(ledgerKey, ledger);
    if (isPlan(body?.plan)) await store.setJSON(planKey, body.plan);
    const current = await snapshot(store);
    return reply({ ...current, ledger });
  } catch (error) {
    return reply({ error: error.status ? error.message : "Storage unavailable" }, error.status || 503);
  }
}
