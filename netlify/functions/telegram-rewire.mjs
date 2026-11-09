export default async function handler() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const site = process.env.URL;
  if (!token || !webhookSecret || !site) return new Response(JSON.stringify({ error: "incomplete" }), { status: 503 });
  const webhookUrl = new URL("/api/telegram", site).toString();
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, secret_token: webhookSecret, allowed_updates: ["message", "callback_query"] }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) return new Response(JSON.stringify({ error: "failed" }), { status: 502 });
  return new Response(JSON.stringify({ ok: true, host: new URL(site).host }), { headers: { "Content-Type": "application/json" } });
}
