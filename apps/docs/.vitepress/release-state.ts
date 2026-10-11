/**
 * Public install availability, maintained independently for npm and PyPI.
 * Change an artifact to published only after publication; enable its quick path only after
 * a clean install/render smoke test of that exact version. Building locally is not publishing.
 */
export type ArtifactState = {
  packageName: string;
  registry: 'npm' | 'PyPI';
} & (
  | { status: 'unpublished'; version?: never; smokeTested?: never }
  | { status: 'published'; version: string; smokeTested: boolean }
);

export const releaseState = {
  // Smoke-tested 2026-10-11: a clean `npm install` of this version with three 0.186.0, built
  // with Vite 8, drew a 2D chart, a 3D surface and a choropleth and exported a PNG in headless
  // Chromium with no request outside the page's origin. The jsDelivr script-tag build drew too.
  npm: {
    packageName: '@mk7s/holochart',
    registry: 'npm',
    status: 'published',
    version: '0.1.0-alpha.0',
    smokeTested: true,
  },
  pypi: { packageName: 'holochart-py', registry: 'PyPI', status: 'unpublished' },
} as const satisfies Record<'npm' | 'pypi', ArtifactState>;

export type InstallEcosystem = 'javascript' | 'python';

/** A registry release and a publicly cloneable source checkout are separate availability states. */
export const sourceInstallState = {
  javascript: { publicRef: 'main', requiredPath: 'packages/holochart' },
  // On public `main` since the first alpha; the "Python notebook bridge" workflow builds and
  // runs it there on every change.
  python: { publicRef: 'main', requiredPath: 'packages/holochart-py' },
} as const;

/** Tested peer from the repository catalog; update alongside npm release verification. */
export const threeInstallTarget = 'three@0.186.0';

/** Never advertise an unverified release, an empty version, or a registry dist-tag. */
export function registryInstallCommand(artifact: ArtifactState): string | undefined {
  if (artifact.status !== 'published' || !artifact.smokeTested) return undefined;
  const exactVersion = /^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z]+)*$/;
  if (!exactVersion.test(artifact.version) || artifact.version === '0.0.0') return undefined;
  return artifact.registry === 'npm'
    ? `npm install ${artifact.packageName}@${artifact.version} ${threeInstallTarget}`
    : `python -m pip install '${artifact.packageName}[plotly]==${artifact.version}'`;
}

export function installStatus(artifact: ArtifactState): string {
  if (artifact.status === 'unpublished') return `${artifact.registry}: source install only`;
  if (!registryInstallCommand(artifact))
    return `${artifact.registry}: release awaiting install verification`;
  return `${artifact.registry}: ${artifact.version} available`;
}
