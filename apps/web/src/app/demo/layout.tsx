import type { ReactNode } from 'react';
import { DashboardFrame } from '@/components/shell';
export default function Layout({ children }: { children: ReactNode }) {
  return <DashboardFrame demo>{children}</DashboardFrame>;
}
