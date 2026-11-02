import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { forbiddenRoots, prunePrivateMappings } from './vercel-file-path-map.mjs';

const functionRoot = path.resolve('.vercel/output/functions/api/index.func');
for (const entry of await readdir(functionRoot)) {
  if (forbiddenRoots.has(entry)) {
    await rm(path.join(functionRoot, entry), { recursive: true, force: true });
  }
}
const configPath = path.join(functionRoot, '.vc-config.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
prunePrivateMappings(config);
await writeFile(configPath, JSON.stringify(config));
console.log('Removed private and non-runtime roots from the prebuilt Vercel function');
