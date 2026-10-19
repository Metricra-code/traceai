import { safeReturnPath } from '@/lib/routes';
import { AuthForm } from '@/features/auth';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  return <AuthForm returnTo={safeReturnPath((await searchParams).returnTo)} />;
}
