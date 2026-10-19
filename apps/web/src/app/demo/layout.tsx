import { Suspense, type ReactNode } from 'react';
import { Loading } from '@/components/ui/feedback';
import { DashboardFrame } from '@/features/dashboard';
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <DashboardFrame demo>{children}</DashboardFrame>
    </Suspense>
  );
}
