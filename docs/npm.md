# Public SDK publication

Status: **prepared, not published**. The intended package is `@traceai/sdk@0.1.0`.
An absent npm registry entry does not prove we own the `traceai` scope. GitHub access to
Metricra-code does not grant npm permissions. Publish only after the owner confirms the npm
account and scope; select an owned name before packaging if this scope is unavailable.

## Owner authentication

```sh
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

The npm CLI is used for registry authentication, not repository installation or builds.
Do not paste passwords, OTPs or tokens into chat or commit a credential-bearing `.npmrc`.
Complete browser/2FA approvals yourself. Do not disable 2FA or replace global registry settings.
Scoped public releases require appropriate account/scope access and publishing authentication;
see [npm's current publication guide](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/).

## Prepare and test the exact artifact

Run the documented static/unit checks, then from the repository root:

```sh
bun install --frozen-lockfile
bun run --filter @traceai/sdk build
bun run --filter @traceai/opentelemetry build
bun run test:packages
```

The package verifier prints an ignored `.local/packages/<run-id>` directory. It builds no packages:
the preceding builds are mandatory, otherwise an old `dist` could be packaged. It installs SDK
and adapter tarballs into an independent temporary consumer, checks strict declarations, MIT/README
and runtime dependencies, then exercises stub-transport delivery on Bun and Node22. No Gemini
request or npm publication occurs during this check.

Inspect `sdk.tgz`: only manifest, README, MIT license and built ESM/declarations/source maps belong
in it, not keys, environment files, private backups, test reports or databases. Review packed
name/version, exports, repository and effective registry. Publish the verified artifact, not a
newly packed directory with potentially different contents.

```sh
# Replace the path with the exact SDK tarball from the successful verification run.
bun publish /absolute/path/to/.local/packages/<run-id>/sdk.tgz \
  --dry-run --access public --registry=https://registry.npmjs.org/
```

Confirm dry-run reports **https://registry.npmjs.org/**. Scope-specific settings may take precedence
over the default registry flag. Never accidentally publish this personal project to an employer
registry or modify another project's registry settings to force publication.

## Explicit owner-authorized publication

After account/scope, content and dry-run checks pass:

```sh
bun publish /absolute/path/to/.local/packages/<run-id>/sdk.tgz \
  --access public --registry=https://registry.npmjs.org/
```

Bun supports prebuilt tarballs; their publication does **not** run lifecycle scripts, so checks
must finish beforehand. [Bun publishing reference](https://bun.sh/docs/pm/cli/publish).
Do not enable automatic publication, use `--tolerate-republish` to hide an existing version,
or claim provenance/OIDC signing for a manual local release.

## Registry and installed-consumer verification

1. Read the exact name/version from npm, including `dist.integrity` and the repository.
2. Install that **registry version** with Bun in a fresh external directory, not a workspace link
   or tarball override. Re-run strict public-type and Bun/Node SDK delivery tests.
3. Record the npm URL, version, integrity and actual verification result here.
4. Only then replace the SDK's "not published" notice with working install commands. Publishing
   the SDK alone does not publish `@traceai/opentelemetry`; keep its notice accurate.

The full-product CI verifies tarballs, not that a new npm release exists or that live Gemini
calls succeeded. Those are separate gates in [Gemini integration](gemini.md).
