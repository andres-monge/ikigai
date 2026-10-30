import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const PRIVATE_OUTPUT_DIRECTORY = '.context/early-access';

/** Walk every existing component without following symlinks. */
export async function privateOutputPath(repoRoot: string, relativePath: string, createDirectories = false): Promise<string> {
  if (!relativePath || isAbsolute(relativePath) || relativePath.split(/[\\/]/).some(part => part === '..' || part === '.' || !part)) {
    throw new Error('Private output must use a relative path inside the private root.');
  }
  const repo = await realpath(repoRoot);
  const destination = resolve(repo, PRIVATE_OUTPUT_DIRECTORY, relativePath);
  const root = join(repo, PRIVATE_OUTPUT_DIRECTORY);
  if (!destination.startsWith(root + sep)) throw new Error('Private output escapes its root.');
  const components = relative(repo, destination).split(sep);
  let current = repo;
  for (let index = 0; index < components.length; index++) {
    current = join(current, components[index]);
    const final = index === components.length - 1;
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || (!final && !info.isDirectory()) || (final && !info.isFile())) throw new Error('Unsafe private output path.');
      if (!final && createDirectories) await chmod(current, 0o700);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!final) {
        if (!createDirectories) throw error;
        await mkdir(current, { mode: 0o700 });
      }
    }
  }
  return destination;
}

export async function writePrivateOutput(repoRoot: string, relativePath: string, content: string, participantKeys: string[]): Promise<string> {
  if (!participantKeys.every(key => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(key))) throw new Error('Invalid artifact participant key.');
  const path = await privateOutputPath(repoRoot, relativePath, true);
  const manifestPath = await privateOutputPath(repoRoot, relativePath + '.manifest.json', true);
  const manifest = await open(manifestPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    // Register before writing content so even an interrupted export is discoverable for erasure.
    await manifest.writeFile(JSON.stringify({ version: 1, path: relativePath, participantKeys: [...new Set(participantKeys)], createdAt: new Date().toISOString() }, null, 2));
  } finally { await manifest.close(); }
  const output = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await output.writeFile(content); } finally { await output.close(); }
  return path;
}
