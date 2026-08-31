import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MethodCheckpoint, MethodModule } from '../../../shared/career-map/selector.js';
import {
  METHOD_MODULE_KEYS,
  METHOD_MODULE_REGISTRY,
  isRegisteredMethodModule,
  type RegisteredMethodModuleKey,
} from './registry.js';

const allowedFrontmatterKeys = new Set(['name', 'description', 'version']);
const contentVersionPattern = /^\d+\.\d+\.\d+$/;

export type MethodModuleLoadErrorCode =
  | 'invalid-registry'
  | 'unregistered-module'
  | 'missing-bundle'
  | 'invalid-frontmatter'
  | 'invalid-bundle';

export class MethodModuleLoadError extends Error {
  constructor(
    readonly code: MethodModuleLoadErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MethodModuleLoadError';
  }
}

export interface LoadedMethodModule {
  readonly key: RegisteredMethodModuleKey;
  readonly name: RegisteredMethodModuleKey;
  readonly description: string;
  readonly contentVersion: string;
  readonly contentDigest: `sha256:${string}`;
  readonly instructions: string;
  readonly sourcePath: string;
}

export interface MethodModuleLoader {
  readonly registeredKeys: readonly RegisteredMethodModuleKey[];
  load(checkpoint: Pick<MethodCheckpoint, 'module'>): LoadedMethodModule;
  loadedKeys(): RegisteredMethodModuleKey[];
}

export interface MethodSkillsRootOptions {
  readonly environment?: string;
  readonly cwd?: string;
  readonly deployment?: 'node' | 'vercel';
}

export interface CreateMethodModuleLoaderOptions extends MethodSkillsRootOptions {
  readonly skillsRoot?: string;
}

interface ParsedSkillFile {
  readonly metadata: Record<string, string>;
  readonly body: string;
}

export function resolveMethodSkillsRoot(options: MethodSkillsRootOptions = {}): string {
  const environment = options.environment ?? process.env.NODE_ENV ?? 'development';
  const cwd = options.cwd ?? process.cwd();
  const deployment = options.deployment ?? (process.env.VERCEL === '1' ? 'vercel' : 'node');

  if (environment === 'production') {
    return deployment === 'vercel'
      ? path.resolve(cwd, 'server/ai/method/skills')
      : path.resolve(cwd, 'dist/method-skills');
  }

  return fileURLToPath(new URL('./skills', import.meta.url));
}

function parseFrontmatter(content: string, module: RegisteredMethodModuleKey): ParsedSkillFile {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new MethodModuleLoadError('invalid-frontmatter', `${module} SKILL.md must start with YAML frontmatter.`);
  }

  const closingIndex = normalized.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    throw new MethodModuleLoadError('invalid-frontmatter', `${module} SKILL.md is missing its frontmatter terminator.`);
  }

  const metadata: Record<string, string> = {};
  const lines = normalized.slice(4, closingIndex).split('\n');
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) {
      throw new MethodModuleLoadError('invalid-frontmatter', `${module} SKILL.md has invalid frontmatter on line ${index + 2}.`);
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!allowedFrontmatterKeys.has(key)) {
      throw new MethodModuleLoadError('invalid-frontmatter', `${module} SKILL.md has unsupported frontmatter key "${key}".`);
    }
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      throw new MethodModuleLoadError('invalid-frontmatter', `${module} SKILL.md has duplicate frontmatter key "${key}".`);
    }
    if (!value) {
      throw new MethodModuleLoadError('invalid-frontmatter', `${module} SKILL.md frontmatter key "${key}" is empty.`);
    }
    metadata[key] = value;
  }

  for (const key of allowedFrontmatterKeys) {
    if (!metadata[key]) {
      throw new MethodModuleLoadError('invalid-frontmatter', `${module} SKILL.md is missing frontmatter key "${key}".`);
    }
  }

  const body = normalized.slice(closingIndex + 5).trim();
  if (!body) {
    throw new MethodModuleLoadError('invalid-bundle', `${module} SKILL.md requires a non-empty instruction body.`);
  }
  if (!body.startsWith('# ')) {
    throw new MethodModuleLoadError('invalid-bundle', `${module} SKILL.md instruction body must start with a level-one heading.`);
  }

  return { metadata, body };
}

function validateRegistry(): void {
  const directories = new Set<string>();
  for (const key of METHOD_MODULE_KEYS) {
    const registration = METHOD_MODULE_REGISTRY[key];
    if (registration.key !== key || registration.directory !== key) {
      throw new MethodModuleLoadError('invalid-registry', `${key} has an invalid registry identity or directory.`);
    }
    if (directories.has(registration.directory)) {
      throw new MethodModuleLoadError('invalid-registry', `${key} reuses a registered module directory.`);
    }
    if (!contentVersionPattern.test(registration.contentVersion)) {
      throw new MethodModuleLoadError('invalid-registry', `${key} has an invalid content version.`);
    }
    directories.add(registration.directory);
  }
}

async function readRegisteredBundle(
  key: RegisteredMethodModuleKey,
  skillsRoot: string,
): Promise<LoadedMethodModule> {
  const registration = METHOD_MODULE_REGISTRY[key];
  const sourcePath = path.resolve(skillsRoot, registration.directory, 'SKILL.md');
  const expectedPrefix = `${path.resolve(skillsRoot)}${path.sep}`;
  if (!sourcePath.startsWith(expectedPrefix)) {
    throw new MethodModuleLoadError('invalid-registry', `${key} resolves outside the fixed Method skills root.`);
  }

  let content: string;
  try {
    content = await readFile(sourcePath, 'utf8');
  } catch (error) {
    throw new MethodModuleLoadError('missing-bundle', `Registered Method module ${key} is unavailable.`, { cause: error });
  }

  const { metadata, body } = parseFrontmatter(content, key);
  if (metadata.name !== key) {
    throw new MethodModuleLoadError('invalid-bundle', `${key} SKILL.md name does not match registry identity.`);
  }
  if (metadata.version !== registration.contentVersion || !contentVersionPattern.test(metadata.version)) {
    throw new MethodModuleLoadError('invalid-bundle', `${key} SKILL.md content version does not match registry.`);
  }

  return Object.freeze({
    key,
    name: key,
    description: metadata.description,
    contentVersion: metadata.version,
    contentDigest: `sha256:${createHash('sha256').update(content).digest('hex')}`,
    instructions: body,
    sourcePath,
  });
}

export async function createMethodModuleLoader(
  options: CreateMethodModuleLoaderOptions = {},
): Promise<MethodModuleLoader> {
  validateRegistry();
  const skillsRoot = path.resolve(options.skillsRoot ?? resolveMethodSkillsRoot(options));
  const bundles = await Promise.all(
    METHOD_MODULE_KEYS.map(async (key) => [key, await readRegisteredBundle(key, skillsRoot)] as const),
  );
  const cache = new Map<RegisteredMethodModuleKey, LoadedMethodModule>(bundles);
  const loaded = new Set<RegisteredMethodModuleKey>();

  return Object.freeze({
    registeredKeys: METHOD_MODULE_KEYS,
    load(checkpoint: Pick<MethodCheckpoint, 'module'>): LoadedMethodModule {
      const module: MethodModule = checkpoint.module;
      if (!isRegisteredMethodModule(module)) {
        throw new MethodModuleLoadError('unregistered-module', `Method module "${module}" is not registered in this build.`);
      }
      const bundle = cache.get(module);
      if (!bundle) {
        throw new MethodModuleLoadError('missing-bundle', `Registered Method module ${module} failed startup validation.`);
      }
      loaded.add(module);
      return bundle;
    },
    loadedKeys(): RegisteredMethodModuleKey[] {
      return METHOD_MODULE_KEYS.filter((key) => loaded.has(key));
    },
  });
}
