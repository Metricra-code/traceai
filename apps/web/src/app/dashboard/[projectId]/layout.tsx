import { Suspense, type ReactNode } from 'react';
import { Loading } from '@/components/ui/feedback';
import { DashboardFrame } from '@/features/dashboard';
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
