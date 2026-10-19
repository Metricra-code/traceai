'use client';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { Project } from '@traceai/shared';
import { PageTitle } from '@/components/ui/page-title';
import { api } from '@/lib/api';
import { paths } from '@/lib/routes';
import { ApiKeysSection, SdkSnippet } from '@/features/api-keys';
import { useDashboard } from '@/features/dashboard';
export function ProjectSettingsView() {
  const { project, apiBase } = useDashboard();
  const cache = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState(false);
  async function perform(action: () => Promise<void>) {
    setPending(true);
    setError('');
    setSuccess('');
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save changes.');
    } finally {
      setPending(false);
    }
  }
  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void perform(async () => {
      await api<Project>(apiBase, {
        method: 'PATCH',
        body: JSON.stringify({ name: fields.get('name'), description: fields.get('description') }),
      });
      await cache.invalidateQueries({ queryKey: ['projects'] });
      setSuccess('Project updated.');
    });
  }
  function deleteProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void perform(async () => {
      await api(apiBase, {
        method: 'DELETE',
        body: JSON.stringify({ confirmName: fields.get('confirmName') }),
      });
      cache.removeQueries({ queryKey: [apiBase] });
      await cache.invalidateQueries({ queryKey: ['projects'] });
      router.push(paths.projects);
    });
  }
  return (
    <>
      <PageTitle
        eyebrow="PROJECT CONFIGURATION"
        subtitle="Ingestion credentials are separate from your dashboard session."
      >
        Settings
      </PageTitle>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="notice">
          {success}
        </p>
      )}
      <section className="settings-section">
        <div className="section-heading">
          <h2>Project details</h2>
          <span className="mono small muted">{project.id}</span>
        </div>
        <form onSubmit={rename} className="stacked-form" key={project.updatedAt}>
          <label>
            Project name
            <input name="name" required maxLength={80} defaultValue={project.name} />
          </label>
          <label>
            Description
            <textarea name="description" maxLength={500} defaultValue={project.description} />
          </label>
          <button disabled={pending}>Save changes</button>
        </form>
      </section>
      <ApiKeysSection apiBase={apiBase} pending={pending} perform={perform} />
      <SdkSnippet />
      <section className="settings-section danger-section">
        <h2>Delete project</h2>
        <p>
          This permanently removes traces and keys. Type <strong>{project.name}</strong> to confirm.
        </p>
        <form onSubmit={deleteProject} className="stacked-form">
          <label>
            Confirm project name
            <input name="confirmName" required autoComplete="off" />
          </label>
          <button className="danger" disabled={pending}>
            Delete project permanently
          </button>
        </form>
      </section>
    </>
  );
}
