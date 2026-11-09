import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createBudgetHandler } from '../netlify/functions/budget.mjs';
import session from '../netlify/functions/session.mjs';
import { sessionCookie } from '../netlify/lib/auth.mjs';
import { memoryStore } from './memory-store.mjs';
import { demoData } from './demo-data.mjs';

// No production credentials, Netlify requests, or real financial data are used.
process.env.BUDGET_LOCAL_DEMO = '1';
process.env.BUDGET_ACCESS_KEY = 'local-demo-only-key-not-for-production';
const store = memoryStore(demoData());
const budget = createBudgetHandler(async () => store);
const publicFiles = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/boot.js', ['boot.js', 'text/javascript']],
  ['/fixes.js', ['fixes.js', 'text/javascript']],
  ['/dialogs-a.html', ['dialogs-a.html', 'text/html']],
  ['/dialogs-b.html', ['dialogs-b.html', 'text/html']],
  ['/plan.html', ['plan.html', 'text/html']],
  ['/plan.js', ['plan.js', 'text/javascript']],
  ['/shared/plan.js', ['shared/plan.js', 'text/javascript']],
  ['/shared/plan-ledger.js', ['shared/plan-ledger.js', 'text/javascript']],
  ['/shared/sync.js', ['shared/sync.js', 'text/javascript']],
  ['/shared/budget.js', ['shared/budget.js', 'text/javascript']],
]);
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/demo') {
      res.writeHead(302, { Location: '/', 'Set-Cookie': sessionCookie(process.env.BUDGET_ACCESS_KEY), 'Cache-Control': 'no-store' }); res.end(); return;
    }
    if (url.pathname === '/api/session' || url.pathname === '/api/budget') {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 256000) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const result = await (url.pathname === '/api/session' ? session(request) : budget(request));
      res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text()); return;
    }
    const file = publicFiles.get(url.pathname);
    if (!file) { res.writeHead(404); res.end('Not found'); return; }
    let body = await readFile(new URL(`../${file[0]}`, import.meta.url), 'utf8');
    if (file[1] === 'text/html') body = body.replace('<body>', '<body><div style="background:#274132;color:#d7f4df;text-align:center;padding:10px;font:14px system-ui">תצוגת בדיקה מקומית · נתוני דוגמה בלבד · לא מחובר לבנק או ל־Netlify</div>').replace('<p id="login-result"', '<p><a href="/demo" style="color:#86b6ff">פתיחת נתוני הדוגמה ללא קוד</a></p><p id="login-result"');
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(body);
  } catch { res.writeHead(500); res.end('Local preview error'); }
}).listen(Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : process.env.PORT || 3000), '0.0.0.0', () => console.log('Local budget demo ready; no production services connected.'));

