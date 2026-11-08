const root = document.getElementById('extra-dialogs');
try {
  const parts = await Promise.all([
    fetch('/dialogs-a.html', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')),
    fetch('/dialogs-b.html', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')),
  ]);
  if (root) root.innerHTML = parts.join('');
} catch (_) {}
await import('/app.js?v=ux-fix-v1');
