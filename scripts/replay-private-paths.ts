/** Private replay storage policy and explicit relocation metadata. No application imports. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

const git = promisify(execFile);
const exists = async (target: string) => lstat(target).then(() => true, (error) => {
  if (['ENOENT', 'ENOTDIR'].includes(error.code)) return false;
  throw error;
});

export async function privateArtifactPath(value: string): Promise<string> {
  const resolved = path.resolve(value);
  let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (await exists(current) && (await lstat(current)).isSymbolicLink()) {
      throw new Error('Private artifacts cannot be symlinks.');
    }
  }
  let ancestor = resolved;
  while (true) {
    if (await exists(path.join(ancestor, '.git'))) {
      const scoped = path.join(ancestor, '.context/revelio');
      if (resolved !== scoped && !resolved.startsWith(scoped + path.sep)) {
        throw new Error('Repository private artifacts require the scoped .context/revelio directory.');
      }
      const tracked = await git('git', ['ls-files', '-z', '--', '.context/revelio'], { cwd: ancestor });
      if (tracked.stdout.length) throw new Error('Private artifact storage contains tracked files.');
      const relative = path.relative(ancestor, resolved);
      try { await git('git', ['check-ignore', '--quiet', '--', relative], { cwd: ancestor }); }
      catch { throw new Error('Private artifacts must be Git-ignored.'); }
      break;
    }
    if (ancestor === path.dirname(ancestor)) break;
    ancestor = path.dirname(ancestor);
  }
  return resolved;
}

export interface ArtifactRelocation { from: string; to: string }
export async function loadArtifactRelocations(root: string): Promise<ArtifactRelocation[]> {
  const file = path.join(root, '.artifact-relocation.json');
  if (!await exists(file)) return [];
  await privateArtifactPath(file);
  const { mappings } = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(mappings)) throw new Error('Invalid artifact relocation map.');
  for (const mapping of mappings) {
    if (typeof mapping.from !== 'string' || !path.isAbsolute(mapping.from) || mapping.from === path.parse(mapping.from).root
      || typeof mapping.to !== 'string' || !path.isAbsolute(mapping.to)) throw new Error('Invalid artifact relocation prefix.');
    await privateArtifactPath(mapping.to);
  }
  return mappings;
}

const referenceKeys = new Set(['artifactPath', 'privateRoot', 'recovery_path', 'review', 'promptDiff', 'rawResult', 'finalMap', 'providerRequests']);
/** Rebase metadata references only. Conversation text, instructions and frozen files stay intact. */
export function rebaseArtifactReferences<T>(value: T, mappings: ArtifactRelocation[]): T {
  const visit = (item: unknown, key = ''): unknown => {
    if (Array.isArray(item)) return item.map((child) => visit(child, key));
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([name, child]) => [name, visit(child, name)]));
    if (typeof item === 'string' && referenceKeys.has(key)) {
      for (const { from, to } of mappings) {
        if (item === from || item.startsWith(from + path.sep)) return to + item.slice(from.length);
      }
    }
    return item;
  };
  return visit(value) as T;
}
