import {
  createShowcaseResponse,
  parseShowcaseQuery,
  recordedCalls,
  ShowcaseQueryError,
} from '@/features/showcase';

export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function GET(request: Request): Response {
  try {
    const query = parseShowcaseQuery(new URL(request.url).searchParams);
    return Response.json(createShowcaseResponse(recordedCalls, query), { headers });
  } catch (error) {
    const invalidQuery = error instanceof ShowcaseQueryError;
    return Response.json(
      {
        error: {
          message: invalidQuery
            ? 'Use an exact model, success/error status and a supported latency sort.'
            : 'The recorded showcase is temporarily unavailable.',
        },
      },
      { status: invalidQuery ? 400 : 500, headers },
    );
  }
}
