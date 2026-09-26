// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PurposePath } from '@shared/career-map';
import { PurposePathCard } from './purpose-path-card';

afterEach(cleanup);

const path = {
  id: 'path-1', revision: 1, name: 'Make difficult systems humane',
  servesWhy: 'Serve people navigating complex decisions.',
  possibility: 'Decision tools that people trust.',
  evidence: ['Turns complexity into clarity', 'Keeps returning to service design'],
  centralUnknown: 'Does the work create durable energy?',
  projectPreview: 'Build one decision aid for a real colleague.',
  practicalFit: 'Can begin in five hours a week.',
  selection: 'available', equalWeight: true,
} satisfies PurposePath;

describe('PurposePathCard', () => {
  it('preserves the founder-selected seven-band order and optional single Start action', () => {
    const onStart = vi.fn();
    const { rerender } = render(<PurposePathCard path={path} index={0} onStart={onStart} startDisabled />);
    const card = screen.getByTestId('purpose-path-card');
    expect(within(card).getByText('Path 01')).toBeTruthy();
    expect([...card.querySelectorAll('[data-path-band]')].map((band) => band.getAttribute('data-path-band'))).toEqual([
      'identity', 'possibility', 'evidence', 'unknown', 'project', 'practical-fit', 'action',
    ]);
    const start = within(card).getByRole('button', { name: 'Start path 1: Make difficult systems humane' });
    expect((start as HTMLButtonElement).disabled).toBe(true);

    rerender(<PurposePathCard path={path} index={0} onStart={onStart} />);
    fireEvent.click(within(screen.getByTestId('purpose-path-card')).getByRole('button'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('is read-only when no Start action is passed', () => {
    render(<PurposePathCard path={path} index={2} />);
    expect(screen.getByText('Path 03')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows an explorer-facing learning question and hides provider citation markers in saved card text', () => {
    render(<PurposePathCard path={{
      ...path,
      name: 'Make difficult systems humane citeturn0search3',
      centralUnknown: 'Do I enjoy this work enough to continue? citeturn0search1',
      practicalFit: 'Try it for five hours a week 【turn0search2】',
    }} index={0} onStart={() => {}} />);
    expect(screen.getByText('What do you need to learn?')).toBeTruthy();
    expect(screen.getByText('Do I enjoy this work enough to continue?')).toBeTruthy();
    expect(screen.getByText('Try it for five hours a week')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start path 1: Make difficult systems humane' })).toBeTruthy();
    expect(screen.getByTestId('purpose-path-card').textContent).not.toMatch(/cite|turn0search/i);
  });

  it('uses the comparison container width for the stack-to-subgrid breakpoint', () => {
    const css = readFileSync('client/src/index.css', 'utf8');
    expect(css).toMatch(/\.purpose-path-comparison\s*\{[^}]*container-type:\s*inline-size/s);
    expect(css).toMatch(/@container\s*\(min-width:\s*1000px\)[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/grid-template-rows:\s*subgrid/);
    expect(css).not.toMatch(/@media\s*\(max-width:\s*1000px\)/);
  });
});
