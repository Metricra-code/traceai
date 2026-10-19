'use client';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { Project } from '@traceai/shared';
import { api } from '@/lib/api';
import { paths } from '@/lib/routes';

export function ProjectSelector({ project }: { project: Project }) {
  const router = useRouter();
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api<{ items: Project[] }>('projects', { signal }),
  });
  return (
    <select
      aria-label="Project selector"
      value={project.id}
      onChange={(e) => router.push(paths.dashboard(e.target.value))}
    >
      {(projects.data?.items ?? [project]).map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}
