'use client';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Plus } from 'lucide-react';
import type { Project } from '@traceai/shared';
import { Empty, Failure, Loading } from '@/components/ui/feedback';
import { PageTitle } from '@/components/ui/page-title';
import { api } from '@/lib/api';
import { paths, sectionPath } from '@/lib/routes';
export function ProjectsView() {
  const cache = useQueryClient();
  const router = useRouter();
  const result = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api<{ items: Project[] }>('projects', { signal }),
  });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      const project = await api<Project>('projects', {
        method: 'POST',
        body: JSON.stringify({ name: fields.get('name'), description: fields.get('description') }),
      });
      await cache.invalidateQueries({ queryKey: ['projects'] });
      router.push(sectionPath(paths.dashboard(project.id), 'settings'));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create project.');
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="YOUR WORKSPACE"
        subtitle="One project per application. Every key and query stays within its boundary."
      >
        Projects
      </PageTitle>
      {result.isPending ? (
        <Loading />
      ) : result.error ? (
        <Failure error={result.error} retry={() => void result.refetch()} />
      ) : (
        <>
          <div className="project-list">
            {result.data.items.length ? (
              result.data.items.map((project) => (
                <Link className="project-row" key={project.id} href={paths.dashboard(project.id)}>
                  <div>
                    <h2>{project.name}</h2>
                    <p className="muted">{project.description || 'No description'}</p>
                    <span className="mono small">{project.id}</span>
                  </div>
                  <ArrowUpRight size={20} />
                </Link>
              ))
            ) : (
              <Empty>
                <h2>Your first project starts here</h2>
                <p>Create a project, generate a key, and instrument an operation.</p>
              </Empty>
            )}
          </div>
          <section className="settings-section">
            <h2>Create project</h2>
            <form onSubmit={create} className="stacked-form">
              <label>
                Project name
                <input name="name" required maxLength={80} placeholder="My AI application" />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  maxLength={500}
                  placeholder="What does this application do?"
                />
              </label>
              {error && (
                <p role="alert" className="field-error">
                  {error}
                </p>
              )}
              <button className="primary" disabled={pending}>
                <Plus size={16} />
                {pending ? 'Creating…' : 'Create project'}
              </button>
            </form>
          </section>
        </>
      )}
    </>
  );
}
