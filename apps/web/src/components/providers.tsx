'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
type Theme = 'dark' | 'light';
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | undefined>(
  undefined,
);
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('Theme provider missing');
  return value;
}
const themeListeners = new Set<() => void>();
let sessionTheme: Theme | undefined;
function storedTheme(): Theme {
  if (sessionTheme) return sessionTheme;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('traceai-theme');
  } catch {
    // Storage may be unavailable; theme still works for this browser session.
  }
  sessionTheme = stored === 'light' ? 'light' : 'dark';
  return sessionTheme;
}
function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}
export function Providers({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, storedTheme, () => 'dark' as const);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    sessionTheme = next;
    try {
      localStorage.setItem('traceai-theme', next);
    } catch {
      // Do not fail a UI preference when browser storage is blocked.
    }
    themeListeners.forEach((listener) => listener());
  }
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeContext.Provider>
  );
}
