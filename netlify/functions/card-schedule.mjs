import { triggerCardSync } from '../lib/card-trigger.mjs';

export default async function handler() {
  await triggerCardSync({ user: false });
  return new Response(null, { status: 202 });
}

