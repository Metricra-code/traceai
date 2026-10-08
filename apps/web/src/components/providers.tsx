'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
export function Providers({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('traceai-theme');
    } catch {
      // Storage may be unavailable; theme still works for this browser session.
    }
    const next = stored === 'light' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('traceai-theme', next);
    } catch {
      // Do not fail a UI preference when browser storage is blocked.
    }
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
