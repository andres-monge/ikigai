import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-black bg-white text-slate-900 shadow-[2px_2px_0_rgba(0,0,0,0.65)] transition-[transform,box-shadow] hover:bg-ikigai-yellow/20 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
    >
      {isDark ? <Sun aria-hidden="true" className="h-4 w-4 text-ikigai-yellow" /> : <Moon aria-hidden="true" className="h-4 w-4" />}
    </button>
  );
}
