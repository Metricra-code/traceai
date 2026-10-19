import type { ReactNode } from 'react';
export function PageTitle({
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
