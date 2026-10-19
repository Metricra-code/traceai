'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import type { ApiKey } from '@traceai/shared';
import { CopyButton } from '@/components/ui/copy-button';
import { Empty, Failure, Loading } from '@/components/ui/feedback';
import { api, utc } from '@/lib/api';

export function ApiKeysSection({
  apiBase,
  pending,
  perform,
}: {
  apiBase: string;
  pending: boolean;
  perform: (action: () => Promise<void>) => Promise<void>;
}) {
  const cache = useQueryClient();
  const keys = useQuery({
    queryKey: [apiBase, 'keys'],
    queryFn: ({ signal }) => api<{ items: ApiKey[] }>(`${apiBase}/api-keys`, { signal }),
  });
  const [rawKey, setRawKey] = useState('');
  const [confirmKey, setConfirmKey] = useState<{ id: string; action: 'revoke' | 'rotate' }>();
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
  return (
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
          <p>You won’t be able to view it again. Keep it on your server, never in browser code.</p>
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
  );
}
