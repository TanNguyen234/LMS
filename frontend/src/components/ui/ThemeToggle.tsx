import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (next: ThemePreference) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = 'lms_theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

const getInitialPreference = (): ThemePreference => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'system';
};

const getSystemPrefersDark = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(getInitialPreference);
  const [systemDark, setSystemDark] = useState<boolean>(getSystemPrefersDark);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: ResolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    if (theme === 'light') {
      root.classList.add('theme-light');
    } else if (theme === 'dark') {
      root.classList.add('theme-dark');
    }
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components
export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
};

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const order: ThemePreference[] = ['light', 'dark', 'system'];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % order.length]);
  };

  const label =
    theme === 'light'
      ? 'Giao diện sáng (nhấn để chuyển tối)'
      : theme === 'dark'
        ? 'Giao diện tối (nhấn để theo hệ thống)'
        : 'Theo hệ thống (nhấn để chuyển sáng)';

  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 text-sm font-medium text-[var(--lms-text)] transition-colors hover:bg-[var(--lms-surface-muted)] ${className}`}
    >
      {theme === 'light' ? (
        <Sun className="h-4 w-4 text-amber-500" aria-hidden="true" />
      ) : theme === 'dark' ? (
        <Moon className="h-4 w-4 text-blue-400" aria-hidden="true" />
      ) : (
        <Monitor className="h-4 w-4 text-[var(--lms-text-muted)]" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">
        {theme === 'light' ? 'Sáng' : theme === 'dark' ? 'Tối' : 'Tự động'}
      </span>
    </button>
  );
}
