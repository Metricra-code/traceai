import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const MAX_SNAPSHOT_BYTES = 1024 * 1024;
const modes = ['production', 'development', 'test'] as const;
const variableNameSchema = z
  .string()
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const variablesSchema = z.record(variableNameSchema, z.string().max(65_536));
// NEXT_PUBLIC_ is not an exemption: a credential must never be a public build variable.
const credentialNamePattern = /API_?KEY|(?:^|_)TOKEN(?:_|$)|SECRET|PASSWORD|CREDENTIAL/i;

type FailureCode = 'invalid_snapshot' | 'credentials_in_snapshot' | 'missing_snapshot';
export class WebEnvironmentError extends Error {
  constructor(
    readonly code: FailureCode,
    readonly blockedNames: readonly string[] = [],
  ) {
    super('OpenNext environment snapshot failed verification.');
    this.name = 'WebEnvironmentError';
  }
}

/** Parse the pinned adapter's JSON exports as data; never execute generated Worker code. */
export function validateWebEnvSnapshot(source: string): void {
  if (Buffer.byteLength(source, 'utf8') > MAX_SNAPSHOT_BYTES)
    throw new WebEnvironmentError('invalid_snapshot');
  const lines = source.split('\n').filter((line) => line.trim() !== '');
  if (lines.length !== modes.length) throw new WebEnvironmentError('invalid_snapshot');
  const seenModes = new Set<string>();
  const blockedNames = new Set<string>();
  for (const line of lines) {
    const match = /^\s*export const (production|development|test) = (\{.*\});\s*$/.exec(line);
    if (!match || seenModes.has(match[1]!)) throw new WebEnvironmentError('invalid_snapshot');
    let variables: z.infer<typeof variablesSchema>;
    try {
      variables = variablesSchema.parse(JSON.parse(match[2]!));
    } catch {
      // Schema and JSON errors may contain values; do not forward their messages or causes.
      throw new WebEnvironmentError('invalid_snapshot');
    }
    seenModes.add(match[1]!);
    for (const name of Object.keys(variables)) {
      if (credentialNamePattern.test(name)) blockedNames.add(name);
    }
  }
  if (blockedNames.size)
    throw new WebEnvironmentError('credentials_in_snapshot', [...blockedNames].sort());
}

export async function verifyWebEnvironment(path: string): Promise<void> {
  let source: string;
  try {
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size > MAX_SNAPSHOT_BYTES)
      throw new WebEnvironmentError('invalid_snapshot');
    source = await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof WebEnvironmentError) throw error;
    throw new WebEnvironmentError('missing_snapshot');
  }
  validateWebEnvSnapshot(source);
}

// Importing this module for offline tests performs no file I/O or environment reads.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  try {
    await verifyWebEnvironment(join(root, 'apps/web/.open-next/cloudflare/next-env.mjs'));
    console.log(
      'OpenNext environment verified: no credential-named variables in compiled snapshots.',
    );
  } catch (error) {
    const failure =
      error instanceof WebEnvironmentError ? error : new WebEnvironmentError('invalid_snapshot');
    console.error(
      `OpenNext environment verification failed (${failure.code})${failure.blockedNames.length ? `: ${failure.blockedNames.join(', ')}` : ''}. Credential values are not printed.`,
    );
    process.exitCode = 1;
  }
}
