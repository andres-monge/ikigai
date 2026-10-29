import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'revelio-theme';
let theme: Theme | undefined;
let choice: Theme | null = null;
const listeners = new Set<() => void>();

function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function snapshot(): Theme {
  if (theme === undefined) {
    choice = readStoredTheme();
    theme = choice ?? systemTheme();
  }
  return theme;
}

function applyTheme(next: Theme) {
  document.documentElement.classList.toggle('dark', next === 'dark');
  if (theme === next) return;
  theme = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const query = window.matchMedia?.('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (choice === null) applyTheme(query?.matches ? 'dark' : 'light');
  };
  applyTheme(choice ?? systemTheme());
  query?.addEventListener('change', onChange);
  return () => {
    listeners.delete(listener);
    query?.removeEventListener('change', onChange);
  };
}

function toggleTheme() {
  choice = snapshot() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(STORAGE_KEY, choice); } catch {
    // An unavailable store must not undo the explicit choice for this visit.
  }
  applyTheme(choice);
}

// One visit-wide preference keeps legacy and current workspace controls coherent.
export function useTheme() {
  return { theme: useSyncExternalStore(subscribe, snapshot, () => 'light'), toggleTheme };
}
