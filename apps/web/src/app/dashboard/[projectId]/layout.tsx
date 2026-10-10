import { Suspense, type ReactNode } from 'react';
import { DashboardFrame } from '@/components/shell';
import { Loading } from '@/components/ui';
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <DashboardFrame key={projectId} projectId={projectId}>
        {children}
      </DashboardFrame>
    </Suspense>
  );
}
