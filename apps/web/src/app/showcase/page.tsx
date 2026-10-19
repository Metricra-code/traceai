import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/app-shell';
import { Loading } from '@/components/ui/feedback';
import { ShowcaseView } from '@/features/showcase';

export const metadata: Metadata = {
  title: 'Real measurements — TraceAI',
  description:
    'Recorded real Gemini API calls captured through the TraceAI TypeScript SDK. Read-only operational measurements, separate from the simulated demo.',
};

export default function Page() {
  return (
    <AppShell variant="showcase">
      <Suspense fallback={<Loading />}>
        <ShowcaseView />
      </Suspense>
    </AppShell>
  );
}
