import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { MethodCheckpoint } from '@shared/career-map';
import {
  BASE_METHOD_INSTRUCTIONS,
  PURPOSE_PATHS_OFFER_ENGLISH,
  R22_CANONICAL_ENGLISH,
} from './base-instructions';
import { METHOD_MODULE_KEYS, METHOD_MODULE_REGISTRY } from './registry';
import {
  MethodModuleLoadError,
  createMethodModuleLoader,
  resolveMethodSkillsRoot,
} from './loader';

const sourceSkillsRoot = fileURLToPath(new URL('./skills', import.meta.url));
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function copySkillsFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'revelio-method-skills-'));
  temporaryRoots.push(root);
  await cp(sourceSkillsRoot, root, { recursive: true });
  return root;
}

function checkpoint(module: string): Pick<MethodCheckpoint, 'module'> {
  return { module: module as MethodCheckpoint['module'] };
}

describe('repository-owned Method module loader', () => {
  it('permits valid independent versions only in explicitly rooted candidate bundles', async () => {
    const root = await copySkillsFixture();
    const file = path.join(root, 'create-purpose-paths/SKILL.md');
    await writeFile(file, (await readFile(file, 'utf8')).replace(/version:.*\n/, 'version: 1.1.7\n'));
    await expect(createMethodModuleLoader({ skillsRoot: root })).rejects.toThrow(/content version does not match registry/i);
    const loader = await createMethodModuleLoader({ skillsRoot: root, versionPolicy: 'candidate' });
    expect(loader.load(checkpoint('create-purpose-paths')).contentVersion).toBe('1.1.7');
    await expect(createMethodModuleLoader({ versionPolicy: 'candidate' })).rejects.toThrow(/explicit skills root/i);
  });

  it('validates the fixed first-three registry and loads exactly the canonical checkpoint module', async () => {
    const loader = await createMethodModuleLoader();

    expect(METHOD_MODULE_KEYS).toEqual([
      'form-foundation',
      'create-purpose-paths',
      'design-path-project',
    ]);
    expect(Object.keys(METHOD_MODULE_REGISTRY)).toEqual(METHOD_MODULE_KEYS);

    const bundle = loader.load(checkpoint('create-purpose-paths'));
    expect(bundle.key).toBe('create-purpose-paths');
    expect(bundle.name).toBe('create-purpose-paths');
    expect(bundle.description).toMatch(/three distinct purpose paths/i);
    expect(bundle.contentVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(bundle.contentDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(bundle.instructions).toContain('# Create Purpose Paths');
    expect(loader.loadedKeys()).toEqual(['create-purpose-paths']);
  });

  it('fails closed for later or unknown checkpoints instead of discovering a filesystem module', async () => {
    const root = await copySkillsFixture();
    const rogueDirectory = path.join(root, 'guide-path-project');
    await cp(path.join(root, 'design-path-project'), rogueDirectory, { recursive: true });
    const loader = await createMethodModuleLoader({ skillsRoot: root });

    expect(() => loader.load(checkpoint('guide-path-project'))).toThrowError(MethodModuleLoadError);
    expect(() => loader.load(checkpoint('../design-path-project'))).toThrow(/not registered/i);
    expect(loader.loadedKeys()).toEqual([]);
  });

  it('rejects malformed, mismatched, duplicate, and extra frontmatter at initialization', async () => {
    const cases = [
      {
        name: 'missing opening delimiter',
        mutate: (content: string) => content.replace(/^---\n/, ''),
        expected: /must start with YAML frontmatter/i,
      },
      {
        name: 'missing closing delimiter',
        mutate: (content: string) => content.replace('\n---\n', '\n'),
        expected: /missing its frontmatter terminator/i,
      },
      {
        name: 'invalid frontmatter line',
        mutate: (content: string) => content.replace(/description:.*\n/, 'description without separator\n'),
        expected: /invalid frontmatter/i,
      },
      {
        name: 'empty required value',
        mutate: (content: string) => content.replace(/description:.*\n/, 'description:\n'),
        expected: /frontmatter key "description" is empty/i,
      },
      {
        name: 'missing required key',
        mutate: (content: string) => content.replace(/version:.*\n/, ''),
        expected: /missing frontmatter key "version"/i,
      },
      {
        name: 'mismatched name',
        mutate: (content: string) => content.replace('name: form-foundation', 'name: wrong-module'),
        expected: /does not match registry/i,
      },
      {
        name: 'duplicate key',
        mutate: (content: string) => content.replace('description:', 'name: form-foundation\ndescription:'),
        expected: /duplicate frontmatter key/i,
      },
      {
        name: 'extra key',
        mutate: (content: string) => content.replace('version:', 'tools: shell\nversion:'),
        expected: /unsupported frontmatter key/i,
      },
      {
        name: 'mismatched version',
        mutate: (content: string) => content.replace(/version:.*\n/, 'version: 9.9.9\n'),
        expected: /content version does not match registry/i,
      },
      {
        name: 'missing body',
        mutate: (content: string) => `${content.slice(0, content.indexOf('\n---\n', 4) + 5)}\n`,
        expected: /instruction body/i,
      },
      {
        name: 'non-H1 body',
        mutate: (content: string) => content.replace('\n# Form Your North Star', '\n## Form Your North Star'),
        expected: /level-one heading/i,
      },
    ];

    for (const testCase of cases) {
      const root = await copySkillsFixture();
      const file = path.join(root, 'form-foundation', 'SKILL.md');
      const content = await readFile(file, 'utf8');
      await writeFile(file, testCase.mutate(content), 'utf8');
      await expect(createMethodModuleLoader({ skillsRoot: root }), testCase.name).rejects.toThrow(testCase.expected);
    }
  });

  it('fails initialization when a registered bundle is missing', async () => {
    const root = await copySkillsFixture();
    await rm(path.join(root, 'form-foundation', 'SKILL.md'));
    await expect(createMethodModuleLoader({ skillsRoot: root })).rejects.toMatchObject({
      code: 'missing-bundle',
    });
  });

  it('keeps global voice, trust, state-order, and brevity rules in the small base instructions', () => {
    expect(BASE_METHOD_INSTRUCTIONS.length).toBeLessThan(4_000);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/plain, concise, and concrete/i);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/prestige/i);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/untrusted data/i);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/committed operation result/i);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/paragraphs.*H2–H4.*bold.*italics.*ordered.*unordered lists/is);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/do not author HTML, links, images, code, tables, or blockquotes/i);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/cards are application-owned/i);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/main agent.*current explorer message.*language/is);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/hedges, quotations, conditionals, or ambiguity.*consequential decision/is);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/pending decision.*respond to the explorer's actual message.*do not push.*choice/is);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/bare ordinal.*exact current path/i);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/match the explorer's conversational register/i);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/recognition over praise/i);
    expect(BASE_METHOD_INSTRUCTIONS).toMatch(/never add generic praise/i);
    expect(BASE_METHOD_INSTRUCTIONS).not.toMatch(/Why I Work|confirmed Why|Suggested Why/i);
    expect(BASE_METHOD_INSTRUCTIONS).not.toMatch(/mirror the language|explicit language change|faithful concise translation/i);
    expect(PURPOSE_PATHS_OFFER_ENGLISH).toBe('Here are three possible paths to pursue your North Star. Each begins with a small, low-commitment project. Think of it like a date. The aim is to learn whether you want to keep going, not to make the project succeed.');
    expect(R22_CANONICAL_ENGLISH).toBe(
      "The point of a project is not to succeed, it's to learn if it's something you'd want to pursue. Think of projects like dating: you start with something chill and low commitment, then invest more only if each date makes you want another.",
    );
  });

  it('encodes the bounded Foundation, path, and first-project hard rules in the loaded modules', async () => {
    const loader = await createMethodModuleLoader();
    const foundation = loader.load(checkpoint('form-foundation')).instructions;
    const paths = loader.load(checkpoint('create-purpose-paths')).instructions;
    const project = loader.load(checkpoint('design-path-project')).instructions;

    expect(foundation).toContain('What activities pull you in so much that you lose track of time?');
    expect(foundation).toMatch(/watching, reading, or thinking.*only/i);
    expect(foundation).toMatch(/explicitly says.*cannot name.*absorbing.*next question.*watching, reading, or thinking/i);
    expect(foundation).toMatch(/never store.*cannot name.*fascination.*fallback question/is);
    expect(foundation).toMatch(/ten-year.*only when/i);
    expect(foundation).toContain('If you could fast-forward ten years, what meaningful change would you be proud to have contributed to?');
    expect(foundation).toContain("I've been asking these questions to understand what purpose you want your work to contribute to. I call it your North Star since it will serve as a guiding principle when suggesting options, and it can evolve as you learn by doing things. I'd say your North Star is:");
    expect(foundation).toContain('use the unqualified label “Your North Star”');
    expect(foundation).toContain('Does this feel right to you, or what would you change?');
    expect(foundation).toMatch(/one concise saved North Star statement.*do not expose.*statement.*serves.*pointOfView/is);
    expect(foundation).not.toMatch(/\bprovisional\b/i);
    expect(foundation).toMatch(/record every supported evidence item and current constraint.*latest message/is);
    expect(foundation).toMatch(/minimum coverage does not make the rest of that message irrelevant/i);
    expect(foundation).toMatch(/asks to pause.*only correcting existing evidence.*instead of proposing automatically/is);
    expect(foundation).toMatch(/coverage is insufficient.*end.*one next.*question/is);
    expect(foundation).toMatch(/First presentation:.*use this introduction exactly/is);
    expect(foundation).toMatch(/saved North Star statement in its own bold paragraph/is);
    expect(foundation).toMatch(/Later revisions:.*natural wording.*rather than repeating the first introduction/is);
    expect(foundation).toMatch(/one short question per turn/i);
    expect(foundation).toMatch(/do not propose Purpose Paths until.*confirmed/i);
    expect(foundation).toMatch(/exact.*invalidatedArtifactClasses/i);
    expect(foundation).toMatch(/zero.*ordinary later-turn confirmation.*no impact classes/is);
    expect(foundation).toMatch(/nonzero.*only.*exact affected.*later explorer turn/is);
    expect(foundation).toMatch(/presentation.*failed.*revise-why.*again/is);
    expect(foundation).toMatch(/unambiguous.*change.*revise-why.*immediately/is);
    expect(foundation).toMatch(/ask(?:s|ing)? to revisit.*does not authorize.*revise-why/is);
    expect(foundation).toMatch(/still fits.*pending paths.*close-focus/is);
    expect(foundation).toMatch(/acknowledgment or confirmation.*confirm-why.*never.*revise-why/is);
    expect(foundation).toMatch(/do not.*same assistant turn.*confirm-why/is);
    expect(foundation).not.toMatch(/Why I Work|confirmed Why|Suggested Why/i);

    expect(paths).toMatch(/exactly three/i);
    expect(paths).toMatch(/equal weight/i);
    expect(paths).toMatch(/never rank/i);
    expect(paths).toMatch(/replace only the requested path/i);
    expect(paths).toMatch(/new interest.*different contribution.*North Star.*reflection/is);
    expect(paths).toMatch(/one focused question.*only when.*changes the kind of path/is);
    expect(paths).toMatch(/small project.*inside the path.*no prior test/i);
    expect(paths).toMatch(/three.*distinct.*learning questions/is);
    expect(paths).toMatch(/combine.*complete three-path set/i);
    expect(paths).toMatch(/explicitly asks for a recommendation/i);
    expect(paths).toMatch(/bare ordinal.*exact current path/i);
    expect(paths).toContain(PURPOSE_PATHS_OFFER_ENGLISH);
    expect(paths).toMatch(/only.*framing.*no.*footer invitation/is);
    expect(paths).toMatch(/what the explorer needs to learn.*interest.*energy.*willingness to continue/is);
    expect(paths).toMatch(/what could become possible.*concrete, excitingly ambitious.*North Star.*feel energized.*without promising success.*distinct from.*small first project/is);
    expect(paths).toMatch(/stated time, money, access.*do not default.*enterprise-scale compliance/is);
    expect(paths).toMatch(/citation markers.*out of every card field/is);
    expect(paths).toMatch(/do not repeat.*seven.*fields/is);
    expect(paths).not.toMatch(/350 words|80 words|confirmed Why|same Why/i);

    expect(project).toMatch(/exactly one first Path Project/i);
    expect(project).toMatch(/one replacement/i);
    expect(project).toMatch(/firsthand beneficiary/i);
    expect(project).toMatch(/present-first-project-framing.*once/i);
    expect(project).toMatch(/later (?:explorer message|turn)/i);
    expect(project).toMatch(/main agent.*semantic.*acceptance.*current explorer message/is);
    expect(project).toMatch(/acceptancePhrase.*not.*exact-match/is);
    expect(project).toMatch(/durable marker prevents repetition after reload or compaction/i);
    expect(project).toContain(R22_CANONICAL_ENGLISH);
    expect(project).not.toMatch(/Spanish conversation|translate all five ideas/i);
    expect(project.indexOf(R22_CANONICAL_ENGLISH)).toBe(project.lastIndexOf(R22_CANONICAL_ENGLISH));
  });
});

describe.runIf(process.env.METHOD_PRODUCTION_SMOKE === '1')('production Method bundle', () => {
  it('loads all three registered SKILL.md files from the packaged Node production filesystem', async () => {
    const productionRoot = resolveMethodSkillsRoot({ environment: 'production' });
    expect(productionRoot).toBe(path.resolve(process.cwd(), 'dist/method-skills'));

    const loader = await createMethodModuleLoader({ environment: 'production' });
    for (const key of METHOD_MODULE_KEYS) {
      const bundle = loader.load(checkpoint(key));
      expect(bundle.sourcePath).toBe(path.join(productionRoot, key, 'SKILL.md'));
      expect(bundle.instructions.length).toBeGreaterThan(200);
    }
  });

  it('loads all three registered SKILL.md files from the Vercel includeFiles source tree', async () => {
    const productionRoot = resolveMethodSkillsRoot({ environment: 'production', deployment: 'vercel' });
    expect(productionRoot).toBe(path.resolve(process.cwd(), 'server/ai/method/skills'));

    const loader = await createMethodModuleLoader({ environment: 'production', deployment: 'vercel' });
    for (const key of METHOD_MODULE_KEYS) {
      const bundle = loader.load(checkpoint(key));
      expect(bundle.sourcePath).toBe(path.join(productionRoot, key, 'SKILL.md'));
      expect(bundle.instructions.length).toBeGreaterThan(200);
    }
  });
});
