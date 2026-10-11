import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { BASE_METHOD_INSTRUCTIONS } from './base-instructions.js';
import { createMethodModuleLoader } from './loader.js';

it('adopts the exact approved Paths skill and voice without rolling back newer Foundation', async () => {
  const frozen = new URL('../../../scripts/replay-lab/frozen/paths-v6/', import.meta.url);
  const loader = await createMethodModuleLoader();
  const paths = await loader.load({ module: 'create-purpose-paths' });
  const expectedPaths = await readFile(new URL('instructions/skills/create-purpose-paths/SKILL.md', frozen), 'utf8');
  const voice = (await readFile(new URL('accepted-voice.txt', frozen), 'utf8')).trim();
  expect(paths.contentVersion).toBe('1.1.7');
  expect(await readFile(new URL('./skills/create-purpose-paths/SKILL.md', import.meta.url), 'utf8')).toBe(expectedPaths);
  expect(BASE_METHOD_INSTRUCTIONS).toContain(voice);
  expect(BASE_METHOD_INSTRUCTIONS).toContain('Use the refreshed Career Map and structured operation results as authority');
  expect(BASE_METHOD_INSTRUCTIONS).toContain('Drafting is allowed');
  expect((await loader.load({ module: 'form-foundation' })).contentVersion).toBe('1.1.13');
});
