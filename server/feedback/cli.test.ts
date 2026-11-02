import { mkdtemp, readFile, stat, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { runFeedback } from '../../scripts/feedback.js';

describe('private feedback operator commands', () => {
  it('keeps bulk output redacted and requires explicit sending and matching target', async () => {
    const id = randomUUID();
    const storage = { list: vi.fn(async () => [{ id, notification: 'unavailable' }]), get: vi.fn(async () => ({ id, text: 'private text', replyEmail: 'fictional@example.test' })), reconcile: vi.fn() };
    const notify = vi.fn(async () => 'accepted');
    const deps = { storage: storage as any, notify, target: 'development' };
    expect(JSON.stringify(await runFeedback(['list', '--target', 'development'], deps))).not.toContain('fictional');
    await expect(runFeedback(['retry', '--target', 'production', '--id', id, '--confirm-send', 'yes'], deps)).rejects.toThrow('target');
    await expect(runFeedback(['retry', '--target', 'development', '--id', id], deps)).rejects.toThrow();
    expect(notify).not.toHaveBeenCalled();
    expect(await runFeedback(['retry', '--target', 'development', '--id', id, '--confirm-send', 'yes'], deps)).toEqual({ id, notification: 'accepted' });
    expect(notify).toHaveBeenCalledTimes(1);
  });
  it('writes one private record exclusively under its private root, rejects escapes and symlinks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'feedback-cli-'));
    const id = randomUUID(); const deps = { storage: { get: async () => ({ id, text: 'fictional private text' }) } as any, notify: vi.fn(), target: 'development', root };
    try {
      await expect(runFeedback(['inspect', '--target', 'development', '--id', id, '--output', '../leak.json'], deps)).rejects.toThrow();
      const output = await runFeedback(['inspect', '--target', 'development', '--id', id, '--output', 'one.json'], deps) as { output: string };
      expect((await stat(output.output)).mode & 0o777).toBe(0o600);
      expect(await readFile(output.output, 'utf8')).toContain('fictional private text');
      await expect(runFeedback(['inspect', '--target', 'development', '--id', id, '--output', 'one.json'], deps)).rejects.toThrow();
      expect(deps.notify).not.toHaveBeenCalled();
      const other = join(root, 'other'); await mkdir(other); await symlink(other, join(root, '.context', 'revelio', 'feedback', 'link.json'));
      await expect(runFeedback(['inspect', '--target', 'development', '--id', id, '--output', 'link.json'], deps)).rejects.toThrow();
    } finally { await rm(root, { recursive: true }); }
  });
});
