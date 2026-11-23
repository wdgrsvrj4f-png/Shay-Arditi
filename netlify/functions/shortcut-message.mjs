import { timingSafeEqual, randomInt } from "node:crypto";
import { budgetStore, readSnapshot } from "../lib/store.mjs";
import { createTelegramHandler } from "./telegram.mjs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function equalSecret(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (process.env.CONTEXT && !["production", "dev"].includes(process.env.CONTEXT)) {
    return json({ error: "Unavailable in previews" }, 403);
  }

  const configuredSecret = process.env.SHORTCUT_API_SECRET;
  if (!configuredSecret) return json({ error: "Shortcut is not configured" }, 503);

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ") || !equalSecret(authorization.slice(7), configuredSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let data;
  try {
    if (Number(request.headers.get("content-length") || 0) > 4096) throw new Error("Too large");
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 4096) throw new Error("Too large");
    data = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const text = typeof data?.text === "string" ? data.text.trim() : "";
  if (!text || text.length > 300) return json({ error: "Text must be 1–300 characters" }, 400);

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) return json({ error: "Telegram is not configured" }, 503);

  try {
    const store = await budgetStore();
    const { data: budget } = await readSnapshot(store);
    const chatId = budget.telegramChatId;
    if (!chatId) return json({ error: "First pair your Telegram bot" }, 409);

    // Synthetic negative IDs cannot collide with Telegram's positive update IDs.
    const updateId = -(Date.now() * 1000 + randomInt(0, 1000));
    const synthetic = new Request("https://shortcut.internal/api/telegram", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": webhookSecret,
      },
      body: JSON.stringify({
        update_id: updateId,
        message: {
          message_id: Math.abs(updateId),
          chat: { id: Number(chatId), type: "private" },
          text,
        },
      }),
    });

    const result = await createTelegramHandler()(synthetic);
    if (!result.ok) return json({ error: "Budget bot could not process the message" }, result.status);
    const outcome = await result.json();
    return json({
      ok: true,
      forwarded: true,
      needsDetails: Boolean(outcome.needsDetails),
      needsLine: Boolean(outcome.needsLine),
    });
  } catch {
    return json({ error: "Temporary processing failure" }, 503);
  }
}
