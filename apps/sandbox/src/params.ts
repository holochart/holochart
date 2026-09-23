/** URL state of the sandbox: `?example=<id>&test=1&dpr=auto|1|2|3&bg=light|dark&size=fit|meta`. */
export type DprSetting = 'auto' | '1' | '2' | '3';
export type BackgroundSetting = 'light' | 'dark';
export type SizeSetting = 'fit' | 'meta';

export interface SandboxParams {
  example: string | null;
  test: boolean;
  dpr: DprSetting;
  bg: BackgroundSetting;
  size: SizeSetting;
}

const DPR_VALUES: readonly DprSetting[] = ['auto', '1', '2', '3'];

export function readParams(search: string = window.location.search): SandboxParams {
  const q = new URLSearchParams(search);
  const dpr = q.get('dpr');
  return {
    example: q.get('example'),
    test: q.get('test') === '1' || q.get('test') === 'true',
    dpr: DPR_VALUES.includes(dpr as DprSetting) ? (dpr as DprSetting) : 'auto',
    bg: q.get('bg') === 'dark' ? 'dark' : 'light',
    size: q.get('size') === 'meta' ? 'meta' : 'fit',
  };
}

/** Serializes params, omitting defaults so URLs stay short (`?example=_dev/hello-cube`). */
export function writeParams(params: SandboxParams): string {
  const q = new URLSearchParams();
  if (params.example) q.set('example', params.example);
  if (params.test) q.set('test', '1');
  if (params.dpr !== 'auto') q.set('dpr', params.dpr);
  if (params.bg !== 'light') q.set('bg', params.bg);
  if (params.size !== 'fit') q.set('size', params.size);
  // Keep `/` readable in example ids.
  const s = q.toString().replace(/%2F/gi, '/');
  return s ? `?${s}` : window.location.pathname;
}
