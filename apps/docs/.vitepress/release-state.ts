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
  npm: { packageName: '@mk7s/holochart', registry: 'npm', status: 'unpublished' },
  pypi: { packageName: 'holochart-py', registry: 'PyPI', status: 'unpublished' },
} as const satisfies Record<'npm' | 'pypi', ArtifactState>;

export type InstallEcosystem = 'javascript' | 'python';

/** A registry release and a publicly cloneable source checkout are separate availability states. */
export const sourceInstallState = {
  javascript: { publicRef: 'main', requiredPath: 'packages/holochart' },
  // The bridge is currently local development work; do not invent a public checkout reference.
  python: { publicRef: null, requiredPath: 'packages/holochart-py' },
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
