'use client';
import { createContext, useContext } from 'react';
import type { Project } from '@traceai/shared';
import type { NavigationState, TraceFilters } from './navigation';

interface DashboardContextValue {
  project: Project;
  apiBase: string;
  basePath: string;
  demo: boolean;
  query: string;
  from: string;
  to: string;
  navigation: NavigationState;
  href: (path: string) => string;
  updateFilters: (filters: Partial<TraceFilters>) => void;
  pagination: { page?: number; previous?: string };
  nextPage: (cursor: string) => void;
  previousPage: () => void;
  firstPage: () => void;
}

export const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error('Dashboard context missing');
  return value;
}
