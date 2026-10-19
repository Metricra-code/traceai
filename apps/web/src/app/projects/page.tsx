import { AccountShell } from '@/features/auth';
import { ProjectsView } from '@/features/projects';
export default function Page() {
  return (
    <AccountShell>
      <ProjectsView />
    </AccountShell>
  );
}
