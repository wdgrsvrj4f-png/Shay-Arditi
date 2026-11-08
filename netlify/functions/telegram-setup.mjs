import { requireAuth } from '../lib/auth.mjs';
import { timingSafeEqual } from "node:crypto";

function sameSecret(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export default async function handler(request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  if (process.env.CONTEXT && !["production", "dev"].includes(process.env.CONTEXT)) return reply({ error: "Telegram setup is disabled in previews" }, 403);
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const pairingCode = process.env.TELEGRAM_PAIRING_CODE;
  if (!token || !webhookSecret || !pairingCode || !process.env.URL) return reply({ error: "Telegram setup is incomplete" }, 503);

  let body;
  try { body = await request.json(); }
  catch { return reply({ error: "Invalid request" }, 400); }
  if (!sameSecret(String(body?.code || ""), pairingCode)) return reply({ error: "The setup code did not match" }, 403);

  const webhookUrl = new URL("/api/telegram", process.env.URL).toString();
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ["message", "callback_query"],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) return reply({ error: "Telegram could not enable the bot" }, 502);
  return reply({ ok: true, message: "The Telegram webhook is active" });
}
