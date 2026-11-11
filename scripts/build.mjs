import { mkdir, copyFile, rm, cp } from 'node:fs/promises';
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('../dist/', import.meta.url));
for (const file of ['index.html', 'budget.js', 'budget.css', 'app.js', 'boot.js', 'fixes.js', 'dialogs-a.html', 'dialogs-b.html', 'plan.html', 'plan.js', 'test.html', 'face.js', 'face.css']) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}
await cp(new URL('../shared/', import.meta.url), new URL('../dist/shared/', import.meta.url), { recursive: true });
console.log('Built public files including the new budget screen');
