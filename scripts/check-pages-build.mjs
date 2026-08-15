import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const buildRoot = path.resolve('dist');
const pagesBase = '/beautiful-water/';
const html = await readFile(path.join(buildRoot, 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/gi)]
  .map((match) => match[1])
  .filter((reference) => !/^(?:data:|https?:|#)/i.test(reference));

if (!references.length) throw new Error('No production assets were emitted');
if (html.includes('/src/')) throw new Error('Production HTML still references source files');

for (const reference of references) {
  if (!reference.startsWith(pagesBase)) {
    throw new Error(`Asset path is not scoped to ${pagesBase}: ${reference}`);
  }

  const pathname = new URL(reference, 'https://example.invalid').pathname;
  const relativePath = decodeURIComponent(pathname.slice(pagesBase.length));
  await access(path.join(buildRoot, relativePath));
}

console.log(`Pages artifact verified: ${references.length} scoped asset references`);
