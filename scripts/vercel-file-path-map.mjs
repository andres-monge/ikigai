import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

export const forbiddenRoots = new Set(['.claude', '.context', 'docs', 'scripts']);
export const runtimeRoots = new Set(['api', 'dist', 'node_modules', 'package.json', 'public', 'server', 'shared']);

function privateRoot(value) {
  return typeof value === 'string' && forbiddenRoots.has(path.posix.normalize(value).split('/')[0]);
}

export function prunePrivateMappings(config) {
  if (config.filePathMap === undefined) return;
  config.filePathMap = Object.fromEntries(Object.entries(config.filePathMap).filter(
    ([destination, source]) => !privateRoot(destination) && !privateRoot(source),
  ));
}

function assertRuntimePath(value, source = false) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') ||
      path.posix.isAbsolute(value) || path.posix.normalize(value) !== value ||
      value.split('/').some((part) => !part || part === '..' || part === '.claude' || part === '.context' ||
        /^\.env(?:\.|$)|\.(?:pem|key)$/.test(part)) ||
      !runtimeRoots.has(value.split('/')[0]) || (source && !value.startsWith('node_modules/') && (
        value.endsWith('.test.ts') || value.split('/').some((part) =>
          forbiddenRoots.has(part) || part === 'dist' || part === 'tests')
      ))) {
    throw new Error('Function filePathMap contains a private or unsupported path');
  }
}

export async function checkedMappings(config, repositoryRoot) {
  const map = config.filePathMap;
  if (map === undefined) return [];
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    throw new Error('Function filePathMap must be an object');
  }
  const root = await realpath(repositoryRoot);
  const entries = [];
  // Vercel maps function-relative keys to repository-relative source files, not bundle files.
  for (const [destination, source] of Object.entries(map)) {
    assertRuntimePath(destination);
    assertRuntimePath(source, true);
    const sourcePath = path.join(root, source);
    let resolved;
    try {
      resolved = await realpath(sourcePath);
    } catch {
      throw new Error('Function filePathMap contains a missing source');
    }
    if (resolved !== sourcePath || !(await lstat(sourcePath)).isFile()) {
      throw new Error('Function filePathMap source must be a regular file without symlinks');
    }
    entries.push({ destination, sourcePath });
  }
  return entries;
}
