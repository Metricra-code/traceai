import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkInstalledPackage,
  parseVerificationOptions,
  validateRegistryRelease,
  verifyIntegrity,
} from './verify-npm-sdk';

const options = {
  package: '@example_account/traceai-sdk',
  version: '0.1.0',
  tarball: '/tmp/traceai-sdk.tgz',
};
const argumentsFor = (changes: Partial<typeof options> = {}) =>
  Object.entries({ ...options, ...changes }).map(([name, value]) => `--${name}=${value}`);
const bytes = new TextEncoder().encode('Synthetic public SDK artifact, not a credential.');
const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const release = {
  name: options.package,
  version: options.version,
  dist: {
    integrity,
    tarball: 'https://registry.npmjs.org/@example_account/traceai-sdk/-/traceai-sdk-0.1.0.tgz',
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('explicit npm SDK verification options', () => {
  it('accepts an explicit underscore-bearing scope without selecting or changing a package', () => {
    expect(parseVerificationOptions(argumentsFor())).toEqual(options);
  });
  it('accepts an explicit unscoped name', () => {
    expect(parseVerificationOptions(argumentsFor({ package: 'example-traceai-sdk' })).package).toBe(
      'example-traceai-sdk',
    );
  });
  it('does not require flags in a particular order', () => {
    expect(parseVerificationOptions(argumentsFor().slice().reverse())).toEqual(options);
  });
  it('preserves an absolute artifact path containing spaces as a single argument', () => {
    const tarball = '/tmp/public SDK/sdk.tgz';
    expect(parseVerificationOptions(argumentsFor({ tarball })).tarball).toBe(tarball);
  });
  it.each(['package', 'version', 'tarball'])('rejects missing --%s', (name) => {
    const args = argumentsFor().filter((argument) => !argument.startsWith(`--${name}=`));
    expect(() => parseVerificationOptions(args)).toThrow();
  });
  it.each(['package', 'version', 'tarball'])('rejects duplicate --%s', (name) => {
    const duplicate = argumentsFor().find((argument) => argument.startsWith(`--${name}=`))!;
    expect(() => parseVerificationOptions([...argumentsFor(), duplicate])).toThrow();
  });
  it('rejects duplicate flags even when there are exactly three arguments', () => {
    expect(() =>
      parseVerificationOptions([
        `--package=${options.package}`,
        '--version=0.1.0',
        '--version=0.1.1',
      ]),
    ).toThrow();
  });
  it.each([
    { args: [] },
    { args: ['--help'] },
    { args: [...argumentsFor(), '--registry=https://unapproved.example'] },
    { args: ['package=example-sdk', '--version=0.1.0', '--tarball=/tmp/sdk.tgz'] },
    { args: ['--package', 'example-sdk', '--version=0.1.0', '--tarball=/tmp/sdk.tgz'] },
    { args: ['--package=', '--version=0.1.0', '--tarball=/tmp/sdk.tgz'] },
  ])('rejects incomplete or unsupported flag syntax: %j', ({ args }) => {
    expect(() => parseVerificationOptions(args)).toThrow();
  });
  it.each([
    'TraceAI',
    '@scope/SDK',
    '@scope',
    '@scope/',
    '@scope/../sdk',
    './sdk',
    '../sdk',
    'pkg name',
    'https://registry.npmjs.org/sdk',
    '-sdk',
    'a'.repeat(215),
  ])('rejects invalid or overlong package names: %s', (packageName) => {
    expect(() => parseVerificationOptions(argumentsFor({ package: packageName }))).toThrow();
  });
  it.each(['latest', '^0.1.0', '~0.1.0', '0.1', '01.2.3', '1.2.3-beta.1', '1.2.3+build', '-1.2.3'])(
    'rejects moving tags, ranges and nonstable/noncanonical versions: %s',
    (version) => {
      expect(() => parseVerificationOptions(argumentsFor({ version }))).toThrow();
    },
  );
  it.each(['sdk.tgz', './sdk.tgz', '../sdk.tgz', '/tmp/sdk.zip', '/', 'file:///tmp/sdk.tgz'])(
    'requires an absolute .tgz artifact path: %s',
    (tarball) => {
      expect(() => parseVerificationOptions(argumentsFor({ tarball }))).toThrow();
    },
  );
});

describe('public registry release guards', () => {
  it('accepts exact release identity and the public registry tarball', () => {
    expect(validateRegistryRelease(release, options)).toEqual(release);
  });
  it('permits the canonical HTTPS port without permitting another origin', () => {
    const tarball = 'https://registry.npmjs.org:443/sdk.tgz';
    expect(
      validateRegistryRelease({ ...release, dist: { ...release.dist, tarball } }, options),
    ).toMatchObject({ dist: { tarball } });
  });
  it('discards unrelated registry metadata rather than copying it into verification output', () => {
    expect(
      validateRegistryRelease({ ...release, readme: 'Unrelated registry text.' }, options),
    ).not.toHaveProperty('readme');
  });
  it.each([
    'http://registry.npmjs.org/sdk.tgz',
    'ftp://registry.npmjs.org/sdk.tgz',
    'file:///tmp/sdk.tgz',
    'https://unapproved.example/sdk.tgz',
    'https://registry.npmjs.org.unapproved.example/sdk.tgz',
    'https://unapproved.example/registry.npmjs.org/sdk.tgz',
    'https://registry.npmjs.org:8443/sdk.tgz',
    'https://user:fake@registry.npmjs.org/sdk.tgz',
    'https://user@registry.npmjs.org/sdk.tgz',
    'https://:fake@registry.npmjs.org/sdk.tgz',
    'https://registry.npmjs.org/sdk.tgz?auth=fake',
    'https://registry.npmjs.org/sdk.tgz#fragment',
  ])('rejects tarball schemes/origins/credentials/query/hash: %s', (tarball) => {
    expect(() =>
      validateRegistryRelease({ ...release, dist: { ...release.dist, tarball } }, options),
    ).toThrow();
  });
  it.each([
    { name: '@different/traceai-sdk' },
    { name: 'example-traceai-sdk' },
    { version: '0.1.1' },
    { version: 'latest' },
  ])('rejects metadata identity different from the explicit release: %j', (changes) => {
    expect(() => validateRegistryRelease({ ...release, ...changes }, options)).toThrow();
  });
  it.each([
    null,
    [],
    {},
    { ...release, dist: undefined },
    { ...release, dist: { tarball: release.dist.tarball } },
    { ...release, dist: { integrity } },
    { ...release, dist: { ...release.dist, integrity: 'sha1-not-sha512' } },
    { ...release, dist: { ...release.dist, integrity: 'sha512-invalid' } },
    { ...release, dist: { ...release.dist, tarball: '/relative.tgz' } },
  ])('rejects malformed registry metadata: %j', (value) => {
    expect(() => validateRegistryRelease(value, options)).toThrow();
  });
});

describe('exact verified artifact integrity', () => {
  it('accepts the exact original bytes and SHA-512 integrity', () => {
    expect(() => verifyIntegrity(bytes, integrity)).not.toThrow();
  });
  it.each([
    new Uint8Array(),
    bytes.slice(0, -1),
    new TextEncoder().encode('A different SDK artifact.'),
    Uint8Array.from([...bytes, 0]),
    Uint8Array.from(bytes, (value, index) => (index === 0 ? value ^ 1 : value)),
  ])('rejects changed, missing, truncated or appended bytes: %j', (changedBytes) => {
    expect(() => verifyIntegrity(changedBytes, integrity)).toThrow(
      'SDK tarball integrity mismatch.',
    );
  });
  it('rejects the same bytes when the expected digest was tampered with', () => {
    const altered = 'sha512-' + Buffer.alloc(64).toString('base64');
    expect(() => verifyIntegrity(bytes, altered)).toThrow('SDK tarball integrity mismatch.');
  });
});

describe('offline import boundary', () => {
  it('does not fetch registry metadata or tarballs when freshly imported', async () => {
    vi.resetModules();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Network is forbidden.'));
    const imported = await import('./verify-npm-sdk');
    expect(imported.verifyNpmSdk).toBeTypeOf('function');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('isolated consumer package containment', () => {
  const withSandbox = async (run: (directory: string) => Promise<void>) => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'traceai-consumer-test-')));
    try {
      await run(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
  const writeFakePackage = async (directory: string) => {
    await mkdir(join(directory, 'dist'), { recursive: true });
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({
        name: options.package,
        version: options.version,
        dependencies: { zod: '4.6.5' },
      }),
    );
    await writeFile(join(directory, 'dist/index.d.ts'), 'export declare const fake: true;');
    await writeFile(join(directory, 'LICENSE'), 'Synthetic test license.');
    await writeFile(join(directory, 'README.md'), 'Synthetic test package.');
  };

  it('accepts an installed package beneath a canonical consumer directory', async () => {
    await withSandbox(async (sandbox) => {
      const consumer = join(sandbox, 'consumer');
      await writeFakePackage(join(consumer, 'node_modules', options.package));
      await expect(checkInstalledPackage(consumer, options)).resolves.toBeUndefined();
    });
  });
  it('accepts an alias of the same consumer rather than misidentifying it as a workspace link', async () => {
    await withSandbox(async (sandbox) => {
      const consumer = join(sandbox, 'consumer');
      const alias = join(sandbox, 'consumer-alias');
      await writeFakePackage(join(consumer, 'node_modules', options.package));
      await symlink(consumer, alias, 'dir');
      await expect(checkInstalledPackage(alias, options)).resolves.toBeUndefined();
    });
  });
  it('rejects a package symlink escaping the isolated consumer', async () => {
    await withSandbox(async (sandbox) => {
      const consumer = join(sandbox, 'consumer');
      const outside = join(sandbox, 'outside');
      await writeFakePackage(outside);
      const installed = join(consumer, 'node_modules', options.package);
      await mkdir(join(installed, '..'), { recursive: true });
      await symlink(outside, installed, 'dir');
      await expect(checkInstalledPackage(consumer, options)).rejects.toThrow(
        'External workspace link found.',
      );
    });
  });
  it('rejects a sibling directory sharing the consumer path prefix', async () => {
    await withSandbox(async (sandbox) => {
      const consumer = join(sandbox, 'consumer');
      const sibling = join(sandbox, 'consumer-other');
      await writeFakePackage(sibling);
      const installed = join(consumer, 'node_modules', options.package);
      await mkdir(join(installed, '..'), { recursive: true });
      await symlink(sibling, installed, 'dir');
      await expect(checkInstalledPackage(consumer, options)).rejects.toThrow(
        'External workspace link found.',
      );
    });
  });
});
