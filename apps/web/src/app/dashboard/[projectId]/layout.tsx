import type { ReactNode } from 'react';
import { DashboardFrame } from '@/components/shell';
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <DashboardFrame projectId={projectId}>{children}</DashboardFrame>;
}
