// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import publishedEssay from '@/content/our-vision.md?raw';
import { OurVision } from './our-vision';

afterEach(cleanup);

it('publishes only the authorized essay with the current product name', () => {
  const source = readFileSync('docs/evidence/nami-public-entry/vision-essay-source.md', 'utf8');
  expect(publishedEssay).toBe(source.replace('with Revelio.', 'with Nami.'));
  render(<OurVision />);
  expect(screen.getByRole('heading', { name: 'How To Figure Out What To Work On', level: 1 })).toBeTruthy();
  for (const name of ['The problem', 'Why I want to tackle the problem', 'What I learned', 'The solution']) {
    expect(screen.getByRole('heading', { name, level: 2 })).toBeTruthy();
  }
  expect(screen.getByRole('article').textContent).toContain("that's exactly what I'm trying to build with Nami.");
  expect(screen.getByRole('article').querySelectorAll('ul li').length).toBe(7);
  expect(screen.getByRole('article').querySelector('em')?.textContent).toBe("didn't");
});
