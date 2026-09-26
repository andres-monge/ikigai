// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ActivityIndicator } from './activity-indicator';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('rotates verbs without an immediate repeat and clears its timer when removed', () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const view = render(<ActivityIndicator />);

  expect(screen.getByText('Accomplishing…')).toBeTruthy();
  expect(screen.getByRole('status', { name: 'Revelio is responding.' })).toBeTruthy();
  act(() => { vi.advanceTimersByTime(1500); });
  expect(screen.getByText('Actioning…')).toBeTruthy();
  act(() => { vi.advanceTimersByTime(1500); });
  expect(screen.getByText('Accomplishing…')).toBeTruthy();

  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
