'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  ArrowUpRight,
} from 'lucide-react';
import type { Project } from '@traceai/shared';
import { paths, sectionPath } from '@/lib/routes';
import { useTheme } from '../providers';

type ShellVariant = 'private' | 'demo' | 'showcase';

const DOCUMENTATION_URL = 'https://github.com/Metricra-code/traceai/tree/main/docs';

function navigation(variant: ShellVariant, basePath: string | undefined) {
  if (variant === 'showcase')
    return [
      { name: 'Overview', href: '#main-content', icon: LayoutDashboard },
      { name: 'Measurements', href: '#measurements', icon: ListTree },
      { name: 'Model summary', href: '#model-summary', icon: Layers },
    ];
  return [
    { name: 'Overview', href: basePath, icon: LayoutDashboard },
    { name: 'Traces', href: basePath && sectionPath(basePath, 'traces'), icon: ListTree },
    { name: 'Models', href: basePath && sectionPath(basePath, 'models'), icon: Layers },
    { name: 'Projects', href: paths.projects, icon: Folder },
    {
      name: 'Settings',
      href: variant === 'private' && basePath ? sectionPath(basePath, 'settings') : undefined,
      icon: Settings,
    },
  ];
}

export function AppShell({
  children,
  variant = 'private',
  project,
  search = '',
  projectControl,
  account,
  banner,
}: {
  children: ReactNode;
  variant?: ShellVariant;
  project?: Project;
  search?: string;
  projectControl?: ReactNode;
  account?: ReactNode;
  banner?: ReactNode;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const showcase = variant === 'showcase';
  const publicView = variant !== 'private';
  const basePath =
    variant === 'demo'
      ? paths.demo
      : variant === 'private' && project
        ? paths.dashboard(project.id)
        : undefined;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <Link href={paths.showcase} className="brand">
          <Activity size={23} />
          <span>
            TraceAI<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-label">
          WORKSPACE <span className="mono">01</span>
        </div>
        <nav aria-label="Main navigation">
          {navigation(variant, basePath).map(
            (item) =>
              item.href && (
                <Link
                  key={item.name}
                  href={
                    basePath && item.href.startsWith(basePath) && search
                      ? `${item.href}?${search}`
                      : item.href
                  }
                  aria-current={
                    (showcase && item.name === 'Overview') || pathname === item.href
                      ? 'page'
                      : undefined
                  }
                >
                  <item.icon size={17} />
                  {item.name}
                </Link>
              ),
          )}
          <a
            className="mobile-documentation"
            href={DOCUMENTATION_URL}
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen size={17} /> Documentation <ArrowUpRight size={13} />
          </a>
        </nav>
        <div className="sidebar-bottom">
          <a href={DOCUMENTATION_URL} target="_blank" rel="noreferrer">
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
            {projectControl ?? (
              <span>
                {showcase ? 'Recorded measurements' : (project?.name ?? 'Your workspace')}
              </span>
            )}
            {variant === 'demo' && <span className="demo-label">DEMO</span>}
            {showcase && <span className="demo-label">REAL</span>}
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
            {publicView ? (
              <Link className="button small-button" href={paths.register}>
                Create workspace <ArrowUpRight size={14} />
              </Link>
            ) : (
              account
            )}
          </div>
        </div>
        {banner}
        <main id="main-content" className="main-content">
          {publicView && (
            <nav className="source-switch" aria-label="Data source">
              <Link href={paths.showcase} aria-current={showcase ? 'page' : undefined}>
                Real measurements
              </Link>
              <Link href={paths.demo} aria-current={variant === 'demo' ? 'page' : undefined}>
                Simulated demo
              </Link>
            </nav>
          )}
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
