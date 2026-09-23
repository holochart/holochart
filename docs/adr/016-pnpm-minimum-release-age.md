# ADR-016: Keep pnpm `minimumReleaseAge` on

- **Status:** Accepted
- **Date:** 2026-09-23
- **Related stories:** E0.1, E0.4, E21.3

## Context

npm supply-chain attacks typically publish a compromised version of a popular package and rely on
projects installing it within hours, before the registry or maintainers pull it. The workspace uses
pnpm 11, whose `minimumReleaseAge` setting refuses to resolve versions published more recently than a
configured age. That occasionally blocks adopting a brand-new release of a dependency (for example a
fresh three.js, Vite, or Vitest version), which is tempting to work around with exemptions.

## Decision

- Use **pnpm 11 with `minimumReleaseAge` kept on**. We do not disable it globally.
- When a desired version is too new, we **pin a slightly older version** (in the pnpm catalog or the
  package manifest) instead of adding an exemption for the fresh release.
- An exemption (e.g. `minimumReleaseAgeExclude`) is allowed only for a security fix that cannot wait,
  as a **documented one-off decision** in the PR that adds it, and is removed once the version has
  aged past the threshold.

## Consequences

### Positive

- Protection against freshly published compromised versions, for us and for CI.
- Fewer surprises from same-day regressions in new releases.
- A consistent, simple rule for all engineers; no per-package negotiation.

### Negative

- Dependencies are sometimes a few days behind latest.
- Urgent security fixes need an explicit exemption decision and cleanup.
- Contributors may hit resolution errors when bumping to a just-released version; the fix is to pin
  an older version or wait.

### Follow-ups

- Mention the rule in `CONTRIBUTING.md` (E0.5) when it is written.

## Alternatives considered

### Disable `minimumReleaseAge`

Always able to take the latest version. Rejected: gives up a cheap, effective supply-chain defense.

### Keep it on, but exempt packages as needed

Each exemption reopens the window the setting is meant to close, and exemptions tend to accumulate.
Rejected except for the documented security-fix case above.

## References

- `pnpm-workspace.yaml`, root `package.json` (`packageManager: pnpm@11`)
