const segment = '[a-zA-Z0-9_-]+';

export const paths = {
  showcase: '/showcase',
  demo: '/demo',
  projects: '/projects',
  login: '/login',
  register: '/register',
  dashboard: (projectId: string) => `/dashboard/${projectId}`,
} as const;

type DashboardSection = 'overview' | 'traces' | 'models' | 'settings';

export function sectionPath(basePath: string, section: DashboardSection): string {
  return section === 'overview' ? basePath : `${basePath}/${section}`;
}

export function tracePath(basePath: string, traceId: string): string {
  return `${basePath}/traces/${encodeURIComponent(traceId)}`;
}

const returnPath = new RegExp(
  `^/(?:projects|dashboard/${segment}(?:/(?:models|settings|traces(?:/${segment})?))?)$`,
);

export function safeReturnPath(candidate: unknown): string {
  return typeof candidate === 'string' && returnPath.test(candidate) ? candidate : paths.projects;
}

const analyticsEndpoints = `overview|metrics|models|traces(?:/${segment})?`;
const proxiedApiPath = new RegExp(
  `^(?:auth/(?:register|login|logout|session)` +
    `|projects(?:/${segment}(?:/(?:${analyticsEndpoints}|api-keys(?:/${segment}(?:/rotate)?)?))?)?` +
    `|demo(?:/(?:${analyticsEndpoints}))?)$`,
);

export function isProxiedApiPath(endpoint: string): boolean {
  return proxiedApiPath.test(endpoint);
}
