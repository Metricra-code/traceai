'use client';
import { createContext, useContext, useState, type ReactNode, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  LayoutDashboard,
  ListTree,
  Layers,
  Folder,
  Settings,
  BookOpen,
  Sun,
  Moon,
  LogOut,
  ArrowUpRight,
  UserRound,
  ChevronDown,
} from 'lucide-react';
import type { Project } from '@traceai/shared';
import { api } from '@/lib/api';
import {
  analyticsHref,
  navigationParams,
  paginationState,
  readNavigation,
  recordNextPage,
  type CursorHistory,
  type NavigationState,
  type TraceFilters,
} from '@/lib/navigation';
import { Failure, Loading } from './ui';
import { TraceWindow } from './trace-window';
import { useTheme } from './providers';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
interface WindowContext {
  project: Project;
  apiBase: string;
  basePath: string;
  demo: boolean;
  query: string;
  from: string;
  to: string;
  navigation: NavigationState;
  href: (path: string) => string;
  updateFilters: (filters: Partial<TraceFilters>) => void;
  pagination: { page?: number; previous?: string };
  nextPage: (cursor: string) => void;
  previousPage: () => void;
  firstPage: () => void;
}
const AnalyticsContext = createContext<WindowContext | undefined>(undefined);
export function useAnalytics() {
  const value = useContext(AnalyticsContext);
  if (!value) throw new Error('Analytics context missing');
  return value;
}
export function Shell({
  children,
  basePath,
  project,
  search = '',
}: {
  children: ReactNode;
  basePath?: string;
  project?: Project;
  search?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const cache = useQueryClient();
  const demo = basePath === '/demo';
  const { theme, toggleTheme } = useTheme();
  const [logoutError, setLogoutError] = useState('');
  const session = useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) =>
      api<{ user: { id: string; email: string } }>('auth/session', { signal }),
    enabled: !demo,
  });
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api<{ items: Project[] }>('projects', { signal }),
    enabled: !!project && !demo,
  });
  const nav = [
    { name: 'Overview', href: basePath, icon: LayoutDashboard },
    { name: 'Traces', href: basePath && `${basePath}/traces`, icon: ListTree },
    { name: 'Models', href: basePath && `${basePath}/models`, icon: Layers },
    { name: 'Projects', href: '/projects', icon: Folder },
    {
      name: 'Settings',
      href: !demo && basePath ? `${basePath}/settings` : undefined,
      icon: Settings,
    },
  ];
  async function logout() {
    try {
      await api('auth/logout', { method: 'POST' });
      cache.clear();
      router.push('/login');
    } catch {
      setLogoutError('Could not sign out. Please try again.');
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <Link href="/demo" className="brand">
          <Activity size={23} />
          <span>
            TraceAI<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-label">
          WORKSPACE <span className="mono">01</span>
        </div>
        <nav aria-label="Main navigation">
          {nav.map(
            (item) =>
              item.href && (
                <Link
                  key={item.name}
                  href={
                    basePath && item.href.startsWith(basePath) && search
                      ? `${item.href}?${search}`
                      : item.href
                  }
                  aria-current={pathname === item.href ? 'page' : undefined}
                >
                  <item.icon size={17} />
                  {item.name}
                </Link>
              ),
          )}
          <a
            className="mobile-documentation"
            href="https://github.com/Metricra-code/traceai/tree/main/docs"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen size={17} /> Documentation <ArrowUpRight size={13} />
          </a>
        </nav>
        <div className="sidebar-bottom">
          <a
            href="https://github.com/Metricra-code/traceai/tree/main/docs"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen size={17} /> Documentation <ArrowUpRight size={13} />
          </a>
          <div className="system-state">
            <span /> Bun · Workers · D1
          </div>
          <p className="muted small">
            Observe the operation.
            <br />
            Keep the content private.
          </p>
        </div>
      </aside>
      <div className="main-column">
        <div className="topbar">
          <div className="topbar-project">
            <Folder size={15} />
            {project && !demo ? (
              <select
                aria-label="Project selector"
                value={project.id}
                onChange={(e) => router.push(`/dashboard/${e.target.value}`)}
              >
                {(projects.data?.items ?? [project]).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : (
              <span>{project?.name ?? 'Your workspace'}</span>
            )}
            {demo && <span className="demo-label">DEMO</span>}
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              aria-label="Toggle theme"
              aria-pressed={theme === 'light'}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              onClick={toggleTheme}
            >
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            {demo ? (
              <Link className="button small-button" href="/register">
                Create workspace <ArrowUpRight size={14} />
              </Link>
            ) : session.data ? (
              <>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button aria-label="Account menu" className="account-trigger">
                      <UserRound size={16} />
                      <span>{session.data.user.email.split('@')[0]}</span>
                      <ChevronDown size={13} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" aria-label="Account actions">
                    <DropdownMenuLabel>
                      <span className="muted small">SIGNED IN AS</span>
                      <span className="account-email">{session.data.user.email}</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/projects">
                        <Folder size={16} /> Projects
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a
                        href="https://github.com/Metricra-code/traceai/tree/main/docs"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <BookOpen size={16} /> Documentation
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => void logout()}>
                      <LogOut size={16} /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button onClick={() => void logout()}>
                  <LogOut size={15} /> Sign out
                </button>
              </>
            ) : !session.isPending ? (
              <Link className="button" href="/login">
                Sign in
              </Link>
            ) : (
              <span className="muted small" role="status">
                Loading account…
              </span>
            )}
          </div>
        </div>
        {logoutError && (
          <p role="alert" className="notice error">
            {logoutError}
          </p>
        )}
        <main id="main-content" className="main-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>TraceAI / LLM observability</span>
          <span className="mono">Privacy-first telemetry</span>
        </footer>
      </div>
    </div>
  );
}
export function DashboardFrame({
  projectId,
  demo = false,
  children,
}: {
  projectId?: string;
  demo?: boolean;
  children: ReactNode;
}) {
  const cache = useQueryClient();
  const metadata = useQuery<{ project: Project; anchor: string } | { items: Project[] }>({
    queryKey: demo ? ['demo'] : ['projects'],
    queryFn: ({ signal }) =>
      demo
        ? api<{ project: Project; anchor: string }>('demo', { signal })
        : api<{ items: Project[] }>('projects', { signal }),
  });
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Navigation retains the query window; a refetch may include backfilled traces within it.
  const [now] = useState(() => new Date().toISOString());
  const [customEditing, setCustomEditing] = useState(false);
  const [history, setHistory] = useState<CursorHistory>([]);
  const [rangeError, setRangeError] = useState('');
  const viewKey = `${pathname}?${searchParams.toString()}`;
  const [editorViewKey, setEditorViewKey] = useState(viewKey);
  // Discard unapplied editor state when navigation restores another snapshot.
  if (editorViewKey !== viewKey) {
    setEditorViewKey(viewKey);
    setCustomEditing(false);
    setRangeError('');
  }
  const refreshing = useIsFetching({ queryKey: [demo ? 'demo' : `projects/${projectId}`] }) > 0;
  if (metadata.isPending)
    return (
      <Shell basePath={demo ? '/demo' : undefined}>
        <Loading />
      </Shell>
    );
  if (metadata.error)
    return (
      <Shell basePath={demo ? '/demo' : undefined}>
        <Failure error={metadata.error} retry={() => void metadata.refetch()} />
      </Shell>
    );
  const data = metadata.data;
  const project =
    'project' in data ? data.project : data.items.find((item) => item.id === projectId);
  if (!project)
    return (
      <Shell>
        <section className="empty">
          <h1>Project not found</h1>
          <Link href="/projects">Back to projects</Link>
        </section>
      </Shell>
    );
  const end = demo && 'anchor' in data ? new Date(Date.parse(data.anchor) + 1).toISOString() : now;
  const basePath = demo ? '/demo' : `/dashboard/${project.id}`;
  const apiBase = demo ? 'demo' : `projects/${project.id}`;
  const fallback = {
    from: new Date(Date.parse(end) - (demo ? 7 : 1) * 86_400_000).toISOString(),
    to: end,
    range: demo ? ('7' as const) : ('1' as const),
  };
  const parsed = readNavigation(new URLSearchParams(searchParams.toString()), fallback);
  if (!parsed.success)
    return (
      <Shell basePath={basePath} project={project}>
        <section className="notice error" role="alert">
          <div>
            <h1>Invalid view parameters</h1>
            <p>
              Use valid UTC dates, filters and pagination parameters with a window of at most 31
              days.
            </p>
            <button onClick={() => router.replace(pathname)}>Reset view</button>
          </div>
        </section>
      </Shell>
    );
  const navigation = parsed.state;
  const { from, to } = navigation;
  const windowView = [basePath, `${basePath}/models`, `${basePath}/traces`].includes(pathname);
  const scopeParams = navigationParams({ ...navigation, cursor: '' });
  scopeParams.delete('range');
  const scope = `${apiBase}:${scopeParams}`;
  const pagination = paginationState(history, scope, navigation.cursor);
  const href = (path: string) => analyticsHref(path, navigation);
  function navigate(next: NavigationState, replace = false) {
    const target = analyticsHref(pathname, next);
    // Next's native History API integration synchronizes useSearchParams without an RSC request.
    if (replace) window.history.replaceState(null, '', target);
    else window.history.pushState(null, '', target);
  }
  function updateFilters(filters: Partial<TraceFilters>) {
    const next = readNavigation(
      navigationParams({ ...navigation, ...filters, cursor: '' }),
      fallback,
    );
    if (next.success) navigate(next.state);
  }
  function refresh() {
    if (navigation.range === 'custom' || !windowView) {
      void cache.invalidateQueries({ queryKey: [apiBase] });
      return;
    }
    // Mark old snapshots stale without refetching a range we are about to replace.
    void cache.invalidateQueries({ queryKey: [apiBase], refetchType: 'none' });
    const finish = new Date().toISOString();
    navigate(
      {
        ...navigation,
        from: new Date(Date.parse(finish) - Number(navigation.range) * 86_400_000).toISOString(),
        to: finish,
        cursor: '',
      },
      true,
    );
  }
  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const start = new Date(`${String(fields.get('from'))}:00Z`);
    const finish = new Date(`${String(fields.get('to'))}:00Z`);
    const distance = finish.getTime() - start.getTime();
    if (!Number.isFinite(distance) || distance <= 0 || distance > 31 * 86_400_000) {
      setRangeError('Choose an increasing UTC range of at most 31 days.');
      return;
    }
    navigate({
      ...navigation,
      from: start.toISOString(),
      to: finish.toISOString(),
      range: 'custom',
      cursor: '',
    });
    setCustomEditing(false);
    setRangeError('');
  }
  return (
    <Shell basePath={basePath} project={project} search={navigationParams(navigation).toString()}>
      <AnalyticsContext.Provider
        value={{
          project,
          apiBase,
          basePath,
          demo,
          query: new URLSearchParams({ from, to }).toString(),
          from,
          to,
          navigation,
          href,
          updateFilters,
          pagination,
          nextPage: (cursor) => {
            setHistory((previous) => recordNextPage(previous, scope, navigation.cursor, cursor));
            navigate({ ...navigation, cursor });
          },
          previousPage: () => {
            if (pagination.previous !== undefined)
              navigate({ ...navigation, cursor: pagination.previous });
          },
          firstPage: () => navigate({ ...navigation, cursor: '' }),
        }}
      >
        <div className="view-toolbar">
          {demo ? (
            <span className="simulated-tag">Simulated data · Read-only</span>
          ) : (
            <span className="muted small">{project.description || 'Application telemetry'}</span>
          )}
          <div className="range-control">
            {!demo && (
              <button disabled={refreshing} onClick={refresh} aria-describedby="trace-window-note">
                Refresh data
              </button>
            )}
            <span className="muted small">UTC</span>
            <select
              aria-label="Date range"
              aria-describedby="trace-window-note"
              value={customEditing ? 'custom' : navigation.range}
              onChange={(e) => {
                setRangeError('');
                if (e.target.value === 'custom') setCustomEditing(true);
                else {
                  setCustomEditing(false);
                  const range = e.target.value as '1' | '7' | '30';
                  navigate({
                    ...navigation,
                    from: new Date(Date.parse(to) - Number(range) * 86_400_000).toISOString(),
                    range,
                    cursor: '',
                  });
                }
              }}
            >
              <option value="1">Last 24 hours</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="custom">Custom range</option>
            </select>
          </div>
        </div>
        <TraceWindow
          from={from}
          to={to}
          mode={
            !windowView
              ? 'retained'
              : demo
                ? 'simulated'
                : navigation.range === 'custom'
                  ? 'custom'
                  : 'preset'
          }
        />
        {(customEditing || navigation.range === 'custom') && (
          <form className="custom-range" onSubmit={applyRange} key={`${viewKey}:${from}:${to}`}>
            <label>
              From (UTC)
              <input name="from" type="datetime-local" defaultValue={from.slice(0, 16)} required />
            </label>
            <label>
              To (UTC)
              <input name="to" type="datetime-local" defaultValue={to.slice(0, 16)} required />
            </label>
            <button type="submit">Apply range</button>
            {rangeError && <p role="alert">{rangeError}</p>}
          </form>
        )}
        {children}
      </AnalyticsContext.Provider>
    </Shell>
  );
}
