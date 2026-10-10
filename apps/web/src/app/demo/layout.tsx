import { Suspense, type ReactNode } from 'react';
import { DashboardFrame } from '@/components/shell';
import { Loading } from '@/components/ui';
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <DashboardFrame demo>{children}</DashboardFrame>
    </Suspense>
  );
}
