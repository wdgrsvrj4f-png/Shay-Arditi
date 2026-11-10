import assert from "node:assert/strict";
import test from "node:test";
import { emptyLedger, validateLedger } from "../netlify/lib/ledger.mjs";

test("empty ledger is valid and phone data is not implied", () => {
  assert.deepEqual(validateLedger(emptyLedger), emptyLedger);
});

test("accepts a salary and an expense", () => {
  const ledger = validateLedger({
    salaries: { "2026-11": 25000 },
    salaryHidden: { "2026-11": true },
    entries: [{ id: "a", month: "2026-11", date: "2026-11-15", name: "קפה", amount: 20, kind: "luxury", method: "cash" }],
    moves: [],
  });
  assert.equal(ledger.salaries["2026-11"], 25000);
  assert.equal(ledger.entries[0].name, "קפה");
});

test("rejects a broken ledger", () => {
  assert.equal(validateLedger({ salaries: {}, entries: [{ id: "a" }], moves: [] }), null);
});
