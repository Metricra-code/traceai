import { TraceDetail } from '@/features/traces';
export default async function Page({ params }: { params: Promise<{ traceId: string }> }) {
  const { traceId } = await params;
  return <TraceDetail traceId={traceId} />;
}
