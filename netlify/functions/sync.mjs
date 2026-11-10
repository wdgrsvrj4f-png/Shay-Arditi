import { sameOrigin } from "../lib/auth.mjs";
import { readJSON, reply } from "../lib/http.mjs";
import { emptyLedger, validateLedger } from "../lib/ledger.mjs";
import { budgetStore, readSnapshot } from "../lib/store.mjs";
import { publicState } from "./budget.mjs";

const ledgerKey = "screen-ledger";

async function snapshot(store) {
  const saved = await store.get(ledgerKey, { type: "json", consistency: "strong" });
  const ledger = validateLedger(saved) || emptyLedger;
  const { data } = await readSnapshot(store);
  return { ledger, legacy: publicState(data) };
}

export default async function handler(request) {
  if (!sameOrigin(request)) return reply({ error: "Forbidden origin" }, 403);
  if (!["GET", "PUT"].includes(request.method)) return reply({ error: "Method not allowed" }, 405);
  try {
    const store = await budgetStore();
    if (request.method === "GET") return reply(await snapshot(store));
    const body = await readJSON(request, 1_000_000);
    const ledger = validateLedger(body?.ledger);
    if (!ledger) return reply({ error: "Invalid ledger" }, 400);
    await store.setJSON(ledgerKey, ledger);
    const current = await snapshot(store);
    return reply({ ...current, ledger });
  } catch (error) {
    return reply({ error: error.status ? error.message : "Storage unavailable" }, error.status || 503);
  }
}
