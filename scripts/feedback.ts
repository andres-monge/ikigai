import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
import { mkdir, lstat, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { FeedbackStorage } from '../server/feedback/storage.js';
import { notifyFeedback } from '../server/feedback/delivery.js';

const uuid = z.string().uuid();
type OperatorStorage = Pick<FeedbackStorage, 'list' | 'get' | 'reconcile'>;
export async function runFeedback(args: string[], deps: {
  storage: OperatorStorage;
  notify: (row: NonNullable<Awaited<ReturnType<FeedbackStorage['get']>>>) => Promise<string>;
  target: string;
  root?: string;
}) {
  const [command, ...rest] = args;
  const options = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--target', '--id', '--output', '--confirm-send', '--provider-id', '--confirm-reconciled'].includes(rest[i]) || !rest[i + 1] || options.has(rest[i])) throw new Error('Invalid feedback arguments');
    options.set(rest[i], rest[i + 1]);
  }
  const target = options.get('--target');
  if (!target || !['development', 'production'].includes(target) || target !== deps.target) throw new Error('Explicit target must match FEEDBACK_DATABASE_TARGET');
  if (command === 'list' && options.size === 1) return deps.storage.list();
  const id = uuid.parse(options.get('--id'));
  const row = await deps.storage.get(id);
  if (!row) throw new Error('Feedback not found');
  if (command === 'inspect' && options.size === 3) {
    const name = options.get('--output');
    if (!name || !/^[a-zA-Z0-9_-]+\.json$/.test(name)) throw new Error('Use a private output basename');
    const repoRoot = resolve(deps.root ?? process.cwd());
    const parts = ['.context', 'revelio', 'feedback'];
    let folder = repoRoot;
    for (const part of parts) {
      folder = resolve(folder, part);
      await mkdir(folder, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      if ((await lstat(folder)).isSymbolicLink()) throw new Error('Private output must not use symlinks');
    }
    const output = resolve(folder, name);
    const child = relative(folder, output);
    if (child.startsWith('..') || isAbsolute(child)) throw new Error('Invalid private output');
    await writeFile(output, JSON.stringify(row, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { output };
  }
  if (command === 'retry' && options.size === 3 && options.get('--confirm-send') === 'yes') return { id, notification: await deps.notify(row) };
  if (command === 'reconcile' && options.size === 4 && options.get('--confirm-reconciled') === 'yes') {
    const providerId = options.get('--provider-id');
    if (!providerId || !/^[A-Za-z0-9_-]{1,200}$/.test(providerId)) throw new Error('A verified provider ID is required');
    await deps.storage.reconcile(id, providerId);
    return { id, notification: 'accepted' };
  }
  throw new Error('Invalid feedback command');
}

async function main() {
  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const schema = await import('../shared/schema.js');
  const target = process.env.FEEDBACK_DATABASE_TARGET;
  if (!target || !process.env.DATABASE_URL) throw new Error('Configure an explicit database target privately');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const storage = new FeedbackStorage(drizzle(pool, { schema }));
    console.log(JSON.stringify(await runFeedback(process.argv.slice(2), {
      storage, target,
      notify: row => notifyFeedback(row, storage, { apiKey: process.env.RESEND_API_KEY ?? '', from: process.env.FEEDBACK_FROM_EMAIL ?? '' }),
    })));
  } finally { await pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Feedback command failed. Check command, target and private runtime configuration.'); process.exitCode = 1; });
