export function reply(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers,
  } });
}

export async function readJSON(request, maxBytes = 256_000) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw Object.assign(new Error('Expected JSON'), { status: 415 });
  }
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error('Missing body'), { status: 400 });
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw Object.assign(new Error('Update too large'), { status: 413 }); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}
