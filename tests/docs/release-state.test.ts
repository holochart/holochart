import { describe, expect, it } from 'vitest';
import {
  installStatus,
  registryInstallCommand,
  type ArtifactState,
} from '../../apps/docs/.vitepress/release-state';

describe('public install availability', () => {
  const npm: ArtifactState = {
    registry: 'npm',
    packageName: '@mk7s/holochart',
    status: 'unpublished',
  };
  const pypi: ArtifactState = {
    registry: 'PyPI',
    packageName: 'holochart-py',
    status: 'published',
    version: '0.1.0',
    smokeTested: true,
  };

  it('allows an independently verified Python release while npm stays unpublished', () => {
    expect(registryInstallCommand(npm)).toBeUndefined();
    expect(registryInstallCommand(pypi)).toBe(
      "python -m pip install 'holochart-py[plotly]==0.1.0'",
    );
    expect(installStatus(npm)).toBe('npm: source install only');
    expect(installStatus(pypi)).toBe('PyPI: 0.1.0 available');
  });

  it('requires a smoke test before advertising a published release', () => {
    const unverified: ArtifactState = { ...pypi, smokeTested: false };
    expect(registryInstallCommand(unverified)).toBeUndefined();
    expect(installStatus(unverified)).toBe('PyPI: release awaiting install verification');
  });

  it.each(['', 'alpha', 'latest', '0.0.0', '0.1.0; echo surprise'])(
    'does not generate an install command for invalid version %j',
    (version) => {
      expect(registryInstallCommand({ ...pypi, version })).toBeUndefined();
    },
  );

  it('pins a verified npm prerelease instead of a mutable dist-tag', () => {
    expect(
      registryInstallCommand({
        ...npm,
        status: 'published',
        version: '0.1.0-alpha.0',
        smokeTested: true,
      }),
    ).toBe('npm install @mk7s/holochart@0.1.0-alpha.0 three@0.186.0');
  });
});
