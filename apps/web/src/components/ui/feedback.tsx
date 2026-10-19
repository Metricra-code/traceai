'use client';
import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { paths } from '@/lib/routes';
export function Loading() {
  return (
    <div className="loading" role="status" aria-label="Loading data">
      <div className="skeleton heading-skeleton" />
      <div className="skeleton chart-skeleton" />
      <span className="sr-only">Loading data…</span>
    </div>
  );
}
export function Failure({ error, retry }: { error: Error; retry?: () => void }) {
  const pathname = usePathname();
  return (
    <section className="notice error" role="alert">
      <AlertCircle size={18} />
      <div>
        <h2>
          {error instanceof ApiError && error.status === 401
            ? 'Sign in to continue'
            : 'Could not load this view'}
        </h2>
        <p>
          {error instanceof ApiError && error.status === 401
            ? 'Your session may have expired. Sign in to access your projects; your data remains private.'
            : error.message}
        </p>
        {error instanceof ApiError && error.status === 401 ? (
          <Link href={`${paths.login}?returnTo=${encodeURIComponent(pathname)}`}>
            Sign in to continue →
          </Link>
        ) : (
          retry && (
            <button onClick={retry}>
              <RefreshCw size={14} /> Try again
            </button>
          )
        )}
      </div>
    </section>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Status({ status }: { status: string }) {
  return (
    <span className={`status ${status === 'error' ? 'status-error' : ''}`}>
      <span aria-hidden="true" />
      {status}
    </span>
  );
}
