import { getStore } from "@netlify/blobs";

const store = getStore("simple-budget");
const blobKey = "shared-budget";
const maxBodyBytes = 128_000;

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function validate(value) {
  if (!value || typeof value !== "object" || !value.months || typeof value.months !== "object" || Array.isArray(value.months)) {
    return null;
  }

  const entries = Object.entries(value.months);
  if (entries.length > 48) return null;

  const months = {};
  for (const [key, month] of entries) {
    const [, year, monthNumber] = /^(\d{4})-(\d{2})$/.exec(key) ?? [];
    if (!year || Number(monthNumber) < 1 || Number(monthNumber) > 12) return null;
    if (!month || typeof month !== "object" || !Array.isArray(month.expenses) || month.expenses.length > 500) return null;

    const budget = Number(month.budget);
    if (!Number.isFinite(budget) || budget < 0 || budget > 1_000_000) return null;

    const expenses = [];
    for (const item of month.expenses) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || item.id.length > 80) return null;
      if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 80) return null;
      const amount = Number(item.amount);
      const createdAt = Number(item.createdAt);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;
      if (!Number.isFinite(createdAt) || createdAt < 0) return null;
      expenses.push({ id: item.id, name: item.name.trim(), amount, createdAt });
    }

    months[key] = { budget, expenses };
  }

  return { months };
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

  const clean = validate(payload);
  if (!clean) return reply({ error: "Invalid budget data" }, 400);

  await store.setJSON(blobKey, clean);
  return reply({ saved: true });
}
