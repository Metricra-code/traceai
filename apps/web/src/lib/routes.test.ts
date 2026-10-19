import { describe, expect, it } from 'vitest';
import { isProxiedApiPath, safeReturnPath, sectionPath, tracePath } from './routes';

describe('BFF API allowlist', () => {
  it.each([
    'auth/login',
    'auth/session',
    'projects',
    'projects/p_1',
    'projects/p_1/overview',
    'projects/p_1/traces/trace-1',
    'projects/p_1/api-keys',
    'projects/p_1/api-keys/k1/rotate',
    'demo',
    'demo/models',
    'demo/traces/trace_1',
  ])('proxies %s', (endpoint) => {
    expect(isProxiedApiPath(endpoint)).toBe(true);
  });

  it.each([
    '',
    'auth',
    'auth/me',
    'health',
    '/projects',
    'projects/',
    'projects/../auth/login',
    'projects/p 1',
    'projects/p_1/settings',
    'demo/api-keys',
    'demo/traces/t1/extra',
    'projects/p_1/api-keys/k1/revoke',
  ])('rejects %s', (endpoint) => {
    expect(isProxiedApiPath(endpoint)).toBe(false);
  });
});

describe('login return path', () => {
  it.each(['/projects', '/dashboard/p_1', '/dashboard/p_1/settings', '/dashboard/p_1/traces/t-1'])(
    'keeps the private route %s',
    (path) => {
      expect(safeReturnPath(path)).toBe(path);
    },
  );

  it.each([
    undefined,
    ['/projects'],
    'https://attacker.test/projects',
    '//attacker.test',
    '/demo',
    '/dashboard/p_1/api-keys',
    '/projects?next=/x',
  ])('falls back to projects for %s', (candidate) => {
    expect(safeReturnPath(candidate)).toBe('/projects');
  });
});

describe('dashboard paths', () => {
  it('builds section and encoded trace paths from one base', () => {
    expect(sectionPath('/demo', 'overview')).toBe('/demo');
    expect(sectionPath('/dashboard/p_1', 'models')).toBe('/dashboard/p_1/models');
    expect(tracePath('/demo', 'a/b')).toBe('/demo/traces/a%2Fb');
  });
});
