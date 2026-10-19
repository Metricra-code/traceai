'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { Project } from '@traceai/shared';
import { AppShell } from '@/components/layout/app-shell';
import { Failure, Loading } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { paths, sectionPath } from '@/lib/routes';
import { AccountShell } from '@/features/auth';
import {
  analyticsHref,
  navigationParams,
  paginationState,
  readNavigation,
  recordNextPage,
  type CursorHistory,
  type NavigationState,
  type TraceFilters,
} from './navigation';
import { ProjectSelector } from './project-selector';
import { RangeToolbar } from './range-toolbar';
import { DashboardContext } from './use-dashboard';

function DashboardShell({
  demo,
  project,
  search,
  children,
}: {
  demo: boolean;
  project?: Project;
  search?: string;
  children: ReactNode;
}) {
  if (demo)
    return (
      <AppShell variant="demo" project={project} search={search}>
        {children}
      </AppShell>
    );
  return (
    <AccountShell
      project={project}
      search={search}
      projectControl={project && <ProjectSelector project={project} />}
    >
      {children}
    </AccountShell>
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
  const [history, setHistory] = useState<CursorHistory>([]);
  if (metadata.isPending)
    return (
      <DashboardShell demo={demo}>
        <Loading />
      </DashboardShell>
    );
  if (metadata.error)
    return (
      <DashboardShell demo={demo}>
        <Failure error={metadata.error} retry={() => void metadata.refetch()} />
      </DashboardShell>
    );
  const data = metadata.data;
  const project =
    'project' in data ? data.project : data.items.find((item) => item.id === projectId);
  if (!project)
    return (
      <DashboardShell demo={demo}>
        <section className="empty">
          <h1>Project not found</h1>
          <Link href={paths.projects}>Back to projects</Link>
        </section>
      </DashboardShell>
    );
  const end = demo && 'anchor' in data ? new Date(Date.parse(data.anchor) + 1).toISOString() : now;
  const basePath = demo ? paths.demo : paths.dashboard(project.id);
  const apiBase = demo ? 'demo' : `projects/${project.id}`;
  const fallback = {
    from: new Date(Date.parse(end) - (demo ? 7 : 1) * 86_400_000).toISOString(),
    to: end,
    range: demo ? ('7' as const) : ('1' as const),
  };
  const parsed = readNavigation(new URLSearchParams(searchParams.toString()), fallback);
  if (!parsed.success)
    return (
      <DashboardShell demo={demo} project={project}>
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
      </DashboardShell>
    );
  const navigation = parsed.state;
  const { from, to } = navigation;
  const windowView = (['overview', 'models', 'traces'] as const)
    .map((section) => sectionPath(basePath, section))
    .includes(pathname);
  const scopeParams = navigationParams({ ...navigation, cursor: '' });
  scopeParams.delete('range');
  const scope = `${apiBase}:${scopeParams}`;
  const pagination = paginationState(history, scope, navigation.cursor);
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
  return (
    <DashboardShell demo={demo} project={project} search={navigationParams(navigation).toString()}>
      <DashboardContext.Provider
        value={{
          project,
          apiBase,
          basePath,
          demo,
          query: new URLSearchParams({ from, to }).toString(),
          from,
          to,
          navigation,
          href: (path) => analyticsHref(path, navigation),
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
        <RangeToolbar
          demo={demo}
          project={project}
          apiBase={apiBase}
          navigation={navigation}
          windowView={windowView}
          navigate={navigate}
        />
        {children}
      </DashboardContext.Provider>
    </DashboardShell>
  );
}
