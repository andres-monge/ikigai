import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const functionRoot = path.resolve('.vercel/output/functions/api/index.func');
const forbiddenRoots = new Set(['.claude', '.context', 'docs', 'scripts']);
for (const entry of await readdir(functionRoot)) {
  if (forbiddenRoots.has(entry)) {
    await rm(path.join(functionRoot, entry), { recursive: true, force: true });
  }
}
console.log('Removed private and non-runtime roots from the prebuilt Vercel function');
