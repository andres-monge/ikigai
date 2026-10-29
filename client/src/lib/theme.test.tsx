// @vitest-environment jsdom
import * as React from 'react';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dark = false;
const changes = new Set<() => void>();
const media = {
  get matches() { return dark; }, media: '(prefers-color-scheme: dark)',
  addEventListener: (_type: string, listener: () => void) => changes.add(listener),
  removeEventListener: (_type: string, listener: () => void) => changes.delete(listener),
};
function changeSystem(value: boolean) {
  act(() => { dark = value; for (const change of changes) change(); });
}
async function controls(count = 1) {
  const { useTheme } = await import('./theme');
  function Control({ name }: { name: string }) {
    const { theme, toggleTheme } = useTheme();
    return <button aria-label={name} aria-pressed={theme === 'dark'} onClick={toggleTheme}>{theme}</button>;
  }
  return render(<>{Array.from({ length: count }, (_, i) => <Control key={i} name={`Theme ${i}`} />)}</>);
}
function bootstrap() {
  const html = readFileSync('client/index.html', 'utf8');
  const script = html.match(/<script[^>]*data-revelio-theme[^>]*>([\s\S]*?)<\/script>/)?.[1];
  expect(script, 'early theme bootstrap exists').toBeTruthy();
  new Function('window', 'document', 'localStorage', script!)(window, document, localStorage);
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock('react', () => React);
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  changes.clear(); dark = false;
  vi.stubGlobal('matchMedia', vi.fn(() => media));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.doUnmock('react'); });

describe('theme preference lifecycle', () => {
  it('follows OS changes while no preference has been chosen', async () => {
    await controls();
    expect(screen.getByRole('button').textContent).toBe('light');
    changeSystem(true);
    expect(screen.getByRole('button').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('keeps a new explicit choice when the OS changes later', async () => {
    await controls();
    fireEvent.click(screen.getByRole('button'));
    expect(localStorage.getItem('revelio-theme')).toBe('dark');
    changeSystem(false);
    expect(screen.getByRole('button').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('keeps all mounted controls coherent', async () => {
    await controls(2);
    fireEvent.click(screen.getByRole('button', { name: 'Theme 0' }));
    expect(screen.getByRole('button', { name: 'Theme 1' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Theme 1' }));
    expect(screen.getByRole('button', { name: 'Theme 0' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('retains an explicit visit choice across OS events and remount when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const view = await controls();
    fireEvent.click(screen.getByRole('button'));
    changeSystem(false);
    expect(screen.getByRole('button').textContent).toBe('dark');
    view.unmount();
    await controls();
    expect(screen.getByRole('button').textContent).toBe('dark');
  });

  it.each(['light', 'dark'] as const)('restores stored %s on a fresh module load', async (value) => {
    localStorage.setItem('revelio-theme', value); dark = value === 'light';
    await controls();
    expect(screen.getByRole('button').textContent).toBe(value);
    changeSystem(!dark);
    expect(screen.getByRole('button').textContent).toBe(value);
  });

  it.each(['light', 'dark', 'invalid', null])('bootstrap and mounted theme agree for stored %s', async (value) => {
    dark = true;
    if (value) localStorage.setItem('revelio-theme', value);
    bootstrap();
    const initial = document.documentElement.classList.contains('dark');
    await controls();
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe(String(initial));
  });
});
