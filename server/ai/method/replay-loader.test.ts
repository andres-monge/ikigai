import { cp, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expect, it } from 'vitest';
import { createMethodModuleLoader } from './loader.js';

it('keeps historical private bundles at their frozen module set and fails closed at missing stages', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'replay-modules-'));
  const modules = ['form-foundation', 'create-purpose-paths', 'design-path-project'] as const;
  try {
    for (const key of modules) await cp(path.resolve('server/ai/method/skills', key), path.join(root,key), {recursive:true});
    const loader = await createMethodModuleLoader({skillsRoot:root, versionPolicy:'candidate', candidateModules:modules});
    expect(loader.registeredKeys).toEqual(modules);
    expect(() => loader.load({module:'interpret-path-project'})).toThrow(/unavailable|missing|failed startup/i);
    await expect(createMethodModuleLoader({skillsRoot:root,candidateModules:modules})).rejects.toThrow(/candidate/i);
  } finally { await rm(root,{recursive:true,force:true}); }
});
