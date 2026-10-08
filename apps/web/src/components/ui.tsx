'use client';
import { useState, type ReactNode } from 'react';
import { Copy, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { ApiError } from '@/lib/api';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
          <Link href={`/login?returnTo=${encodeURIComponent(pathname)}`}>
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
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [state, setState] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('Copied');
    } catch {
      setState('Copy unavailable — select the text manually.');
    }
  }
  return (
    <span className="copy-control">
      <button type="button" onClick={() => void copy()}>
        {state === 'Copied' ? <Check size={14} /> : <Copy size={14} />}
        {label}
      </button>
      <span className="muted" role="status">
        {state}
      </span>
    </span>
  );
}
export function Status({ status }: { status: string }) {
  return (
    <span className={`status ${status === 'error' ? 'status-error' : ''}`}>
      <span aria-hidden="true" />
      {status}
    </span>
  );
}
export function Title({
  eyebrow,
  children,
  subtitle,
}: {
  eyebrow: string;
  children: ReactNode;
  subtitle?: string;
}) {
  return (
    <header className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{children}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
    </header>
  );
}
