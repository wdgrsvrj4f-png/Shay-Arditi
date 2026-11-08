import { mkdir, copyFile, rm, cp } from 'node:fs/promises';
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('../dist/', import.meta.url));
for (const file of ['index.html', 'app.js']) await copyFile(new URL(`../${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
await cp(new URL('../shared/', import.meta.url), new URL('../dist/shared/', import.meta.url), { recursive: true });
console.log('Built public files only: index.html, app.js, shared/.');
