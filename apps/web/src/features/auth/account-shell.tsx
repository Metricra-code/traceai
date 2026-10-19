'use client';
import { useState, type ComponentProps } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChevronDown, Folder, LogOut, UserRound } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { paths } from '@/lib/routes';

type Session = { user: { id: string; email: string } };

function AccountActions({ onLogout }: { onLogout: () => void }) {
  const session = useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) => api<Session>('auth/session', { signal }),
  });
  if (session.data)
    return (
      <>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button aria-label="Account menu" className="account-trigger">
              <UserRound size={16} />
              <span>{session.data.user.email.split('@')[0]}</span>
              <ChevronDown size={13} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-label="Account actions">
            <DropdownMenuLabel>
              <span className="muted small">SIGNED IN AS</span>
              <span className="account-email">{session.data.user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={paths.projects}>
                <Folder size={16} /> Projects
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href="https://github.com/Metricra-code/traceai/tree/main/docs"
                target="_blank"
                rel="noreferrer"
              >
                <BookOpen size={16} /> Documentation
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onLogout}>
              <LogOut size={16} /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button onClick={onLogout}>
          <LogOut size={15} /> Sign out
        </button>
      </>
    );
  if (!session.isPending)
    return (
      <Link className="button" href={paths.login}>
        Sign in
      </Link>
    );
  return (
    <span className="muted small" role="status">
      Loading account…
    </span>
  );
}

export function AccountShell(
  props: Omit<ComponentProps<typeof AppShell>, 'variant' | 'account' | 'banner'>,
) {
  const router = useRouter();
  const cache = useQueryClient();
  const [logoutError, setLogoutError] = useState('');
  async function logout() {
    try {
      await api('auth/logout', { method: 'POST' });
      cache.clear();
      router.push(paths.login);
    } catch {
      setLogoutError('Could not sign out. Please try again.');
    }
  }
  return (
    <AppShell
      {...props}
      variant="private"
      account={<AccountActions onLogout={() => void logout()} />}
      banner={
        logoutError && (
          <p role="alert" className="notice error">
            {logoutError}
          </p>
        )
      }
    />
  );
}
