import { AuthForm } from '@/features/auth';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const candidate = (await searchParams).returnTo;
  const returnTo =
    typeof candidate === 'string' &&
    /^\/(?:projects|dashboard\/[a-zA-Z0-9_-]+(?:\/(?:models|settings|traces(?:\/[a-zA-Z0-9_-]+)?))?)$/.test(
      candidate,
    )
      ? candidate
      : '/projects';
  return <AuthForm returnTo={returnTo} />;
}
