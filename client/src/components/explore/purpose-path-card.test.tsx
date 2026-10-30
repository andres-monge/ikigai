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
  it('preserves the agreed five-band order and optional single Start action', () => {
    const onStart = vi.fn();
    const { rerender } = render(<PurposePathCard path={path} index={0} onStart={onStart} startDisabled />);
    const card = screen.getByTestId('purpose-path-card');
    expect(within(card).getByText('Path 01')).toBeTruthy();
    expect([...card.querySelectorAll('[data-path-band]')].map((band) => band.getAttribute('data-path-band'))).toEqual([
      'identity', 'unknown', 'project', 'fit', 'action',
    ]);
    expect(within(card).queryByText('What could become possible')).toBeNull();
    expect(within(card).queryByText(path.possibility)).toBeNull();
    expect(within(card).getByText('Why it may fit')).toBeTruthy();
    expect(within(card).queryByText('Evidence')).toBeNull();
    expect(within(card).queryByText('Feasibility')).toBeNull();
    const start = within(card).getByRole('button', { name: 'Start path 1: Make difficult systems humane' });
    expect((start as HTMLButtonElement).disabled).toBe(true);

    rerender(<PurposePathCard path={path} index={0} onStart={onStart} />);
    fireEvent.click(within(screen.getByTestId('purpose-path-card')).getByRole('button'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('shows four ordered unlabeled fit bullets without naming the framework or its dimensions', () => {
    const evidence = [
      'You keep returning to making useful tools for people close to you.',
      'Helping people act on their own decisions serves the contribution you want to make.',
      'Your colleagues already use tools you have built to simplify their work.',
    ];
    const practicalFit = 'A small tool for one person can fit into your two spare hours a week.';
    render(<PurposePathCard path={{ ...path, evidence, practicalFit }} index={0} />);
    const fit = screen.getByTestId('purpose-path-card').querySelector('[data-path-band="fit"]')!;
    expect([...fit.querySelectorAll('li')].map((item) => item.textContent)).toEqual([...evidence, practicalFit]);
    expect(fit.querySelectorAll('ul')).toHaveLength(1);
    expect(fit.textContent).not.toMatch(/Ikigai|Evidence|Feasibility|Love:|Meaningful:|Good at:|Constraint fit:/i);
  });

  it('renders a new card without legacy possibility and is read-only without a Start action', () => {
    const { possibility: _legacy, ...newPath } = path;
    render(<PurposePathCard path={newPath} index={2} />);
    expect(screen.getByText('Path 03')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Initial project idea')).toBeTruthy();
    expect(screen.getByText(newPath.projectPreview)).toBeTruthy();
    expect(screen.queryByText(/See the project card for the developed brief/)).toBeNull();
  });

  it('shows an explorer-facing learning question and hides provider citation markers in saved card text', () => {
    render(<PurposePathCard path={{
      ...path,
      name: 'Make difficult systems humane citeturn0search3',
      centralUnknown: 'Do I enjoy this work enough to continue? citeturn0search1',
      practicalFit: 'Try it for five hours a week 【turn0search2】',
    }} index={0} onStart={() => {}} />);
    expect(screen.getByText('What you need to learn')).toBeTruthy();
    expect(screen.getByText('Do I enjoy this work enough to continue?')).toBeTruthy();
    expect(screen.getByText(/Try it for five hours a week/)).toBeTruthy();
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
