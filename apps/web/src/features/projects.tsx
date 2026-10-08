'use client';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Plus, KeyRound } from 'lucide-react';
import type { Project, ApiKey } from '@traceai/shared';
import { useAnalytics, Shell } from '@/components/shell';
import { CopyButton, Empty, Failure, Loading, Title } from '@/components/ui';
import { api, utc } from '@/lib/api';
export function ProjectsView() {
  const cache = useQueryClient();
  const router = useRouter();
  const result = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<{ items: Project[] }>('projects'),
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
      router.push(`/dashboard/${project.id}/settings`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create project.');
    } finally {
      setPending(false);
    }
  }
  return (
    <Shell>
      <Title
        eyebrow="YOUR WORKSPACE"
        subtitle="One project per application. Every key and query stays within its boundary."
      >
        Projects
      </Title>
      {result.isPending ? (
        <Loading />
      ) : result.error ? (
        <Failure error={result.error} retry={() => void result.refetch()} />
      ) : (
        <>
          <div className="project-list">
            {result.data.items.length ? (
              result.data.items.map((project) => (
                <Link className="project-row" key={project.id} href={`/dashboard/${project.id}`}>
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
    </Shell>
  );
}
const integration = `import { TraceAI } from '@traceai/sdk';

const traceai = new TraceAI({
  apiKey: Bun.env.TRACEAI_API_KEY!,
  endpoint: Bun.env.TRACEAI_ENDPOINT!,
});

const result = await traceai.trace(
  { name: 'chat-completion', provider: 'openai', model: 'your-model' },
  async (span) => {
    const response = await callYourModel();
    span.setUsage({
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    });
    return response;
  },
);

// Before a short-lived process exits:
await traceai.shutdown();`;
export function SettingsView() {
  const { project, apiBase } = useAnalytics();
  const cache = useQueryClient();
  const router = useRouter();
  const keys = useQuery({
    queryKey: [apiBase, 'keys'],
    queryFn: () => api<{ items: ApiKey[] }>(`${apiBase}/api-keys`),
  });
  const [rawKey, setRawKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmKey, setConfirmKey] = useState<{ id: string; action: 'revoke' | 'rotate' }>();
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
  async function createKey(keyId?: string) {
    setRawKey('');
    const result = await api<{ apiKey: ApiKey; key: string }>(
      `${apiBase}/api-keys${keyId ? `/${keyId}/rotate` : ''}`,
      { method: 'POST' },
    );
    setRawKey(result.key);
    setConfirmKey(undefined);
    await cache.invalidateQueries({ queryKey: [apiBase, 'keys'] });
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
      router.push('/projects');
    });
  }
  return (
    <>
      <Title
        eyebrow="PROJECT CONFIGURATION"
        subtitle="Ingestion credentials are separate from your dashboard session."
      >
        Settings
      </Title>
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
      <section className="settings-section">
        <div className="section-heading">
          <div>
            <h2>Ingestion API keys</h2>
            <p className="muted small">
              Salted hashes at rest. Raw keys are shown once, never recovered.
            </p>
          </div>
          <button
            className="primary"
            disabled={pending}
            onClick={() => void perform(() => createKey())}
          >
            <KeyRound size={15} />
            Generate API key
          </button>
        </div>
        {rawKey && (
          <div className="key-reveal">
            <h3>Save this key now</h3>
            <p>
              You won’t be able to view it again. Keep it on your server, never in browser code.
            </p>
            <output data-testid="raw-api-key" className="mono">
              {rawKey}
            </output>
            <div>
              <CopyButton value={rawKey} label="Copy key" />
              <button onClick={() => setRawKey('')}>I saved it · Hide key</button>
            </div>
          </div>
        )}
        {keys.error ? (
          <Failure error={keys.error} retry={() => void keys.refetch()} />
        ) : keys.isPending ? (
          <Loading />
        ) : !keys.data.items.length ? (
          <Empty>
            <p>No keys yet. Generate one to connect the SDK.</p>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <caption className="sr-only">Project ingestion API keys</caption>
              <thead>
                <tr>
                  <th>Key prefix</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.data.items.map((key) => (
                  <tr key={key.id}>
                    <td className="mono">{key.keyPrefix}…</td>
                    <td className="small">{utc(key.createdAt)}</td>
                    <td className="small">{key.lastUsedAt ? utc(key.lastUsedAt) : 'Never'}</td>
                    <td>{key.revokedAt ? 'Revoked' : 'Active'}</td>
                    <td>
                      <div className="row-actions">
                        {!key.revokedAt && (
                          <>
                            <button
                              disabled={pending}
                              onClick={() => setConfirmKey({ id: key.id, action: 'rotate' })}
                            >
                              Rotate key
                            </button>
                            <button
                              disabled={pending}
                              className="danger-text"
                              onClick={() => setConfirmKey({ id: key.id, action: 'revoke' })}
                            >
                              Revoke key
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {confirmKey && (
          <div className="notice">
            <div>
              <h3>{confirmKey.action === 'revoke' ? 'Revoke' : 'Rotate'} this key?</h3>
              <p>
                The current key will stop accepting telemetry immediately.
                {confirmKey.action === 'rotate' ? ' A replacement will be shown once.' : ''}
              </p>
              <div className="row-actions">
                <button
                  className="danger"
                  disabled={pending}
                  onClick={() =>
                    void perform(async () => {
                      setRawKey('');
                      if (confirmKey.action === 'rotate') {
                        await createKey(confirmKey.id);
                      } else {
                        await api(`${apiBase}/api-keys/${confirmKey.id}`, { method: 'DELETE' });
                        setConfirmKey(undefined);
                        await cache.invalidateQueries({ queryKey: [apiBase, 'keys'] });
                      }
                    })
                  }
                >
                  Confirm {confirmKey.action}
                </button>
                <button onClick={() => setConfirmKey(undefined)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </section>
      <section className="settings-section">
        <div className="section-heading">
          <h2>Connect the TypeScript SDK</h2>
          <CopyButton value={integration} label="Copy example" />
        </div>
        <p className="muted">
          In this repository: <code>bun install</code>, then run the mock example with environment
          variables. No paid model calls are required.
        </p>
        <pre>{`TRACEAI_API_KEY=<your saved key>\nTRACEAI_ENDPOINT=<your API Worker URL>\n\nbun run demo:node`}</pre>
        <pre>{integration}</pre>
        <p className="footnote">
          Telemetry is batched in the background. Operation results and original errors are
          preserved. Explicit usage is provider-specific; adapt those fields to your client.{' '}
          <a href="https://github.com/Metricra-code/traceai/blob/main/docs/sdk.md">
            SDK reliability and installation →
          </a>
        </p>
      </section>
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
