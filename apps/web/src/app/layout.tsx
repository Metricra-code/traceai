import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';
export const metadata: Metadata = {
  title: 'TraceAI — LLM observability',
  description:
    'Privacy-first LLM telemetry. Inspect latency, model performance and individual operations.',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
