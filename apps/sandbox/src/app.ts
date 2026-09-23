import { exampleIds, loadExample } from '@mk7s/holochart-examples/index.ts';
import type { ExampleHandle } from '@mk7s/holochart-examples/_lib/types.ts';
import { setDevicePixelRatio } from './dpr.ts';
import { readParams, writeParams, type SandboxParams } from './params.ts';
import { createStatsOverlay } from './stats.ts';
import { DEFAULT_TEST_SIZE } from './test-protocol.ts';

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
}

function option(value: string, label = value): HTMLOptionElement {
  return h('option', { value, textContent: label });
}

/** Builds the example `<select>`, grouping ids by their first path segment. */
function buildPicker(): HTMLSelectElement {
  const select = h('select', { title: 'Example' });
  select.append(option('', exampleIds.length ? '— pick an example —' : '(no examples found)'));
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const id of exampleIds) {
    const slash = id.lastIndexOf('/');
    const group = slash >= 0 ? id.slice(0, slash) : '(root)';
    let optgroup = groups.get(group);
    if (!optgroup) {
      optgroup = h('optgroup', { label: group });
      groups.set(group, optgroup);
      select.append(optgroup);
    }
    optgroup.append(option(id, slash >= 0 ? id.slice(slash + 1) : id));
  }
  return select;
}

/** Interactive sandbox: example picker, URL routing, stats overlay, DPR/background/size toggles. */
export function startApp(root: HTMLElement): void {
  let params = readParams();

  const picker = buildPicker();
  const prev = h('button', { textContent: '◀', title: 'Previous example (,)' });
  const next = h('button', { textContent: '▶', title: 'Next example (.)' });
  const dpr = h('select', { title: 'Device pixel ratio' }, [
    option('auto', `DPR auto (${window.devicePixelRatio})`),
    option('1', 'DPR 1'),
    option('2', 'DPR 2'),
    option('3', 'DPR 3'),
  ]);
  const bg = h('button', { title: 'Toggle light/dark page background' });
  const size = h('button', {
    title: 'Fit the window, or use the fixed visual-test size (meta.size)',
  });
  const rerun = h('button', { textContent: 'Re-run', title: 'Dispose and re-run the example (r)' });
  const title = h('span', { className: 'title' });
  const toolbar = h('header', { className: 'toolbar' }, [
    h('strong', { textContent: 'Holochart' }),
    prev,
    picker,
    next,
    rerun,
    dpr,
    size,
    bg,
    title,
  ]);
  const stage = h('main', { className: 'stage' });
  const description = h('p', { className: 'description' });
  root.append(toolbar, description, stage);
  const stats = createStatsOverlay(root);

  let handle: ExampleHandle | undefined;
  let generation = 0;

  const unmount = (): void => {
    stats.setRenderer(undefined);
    try {
      handle?.dispose();
    } catch (error) {
      console.error('dispose() threw', error);
    }
    handle = undefined;
    stage.replaceChildren();
  };

  const showError = (error: unknown): void => {
    console.error(error);
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    stage.replaceChildren(h('pre', { className: 'error', textContent: message }));
  };

  const mount = async (): Promise<void> => {
    const current = ++generation;
    unmount();
    picker.value = params.example ?? '';
    dpr.value = params.dpr;
    document.documentElement.dataset.bg = params.bg;
    bg.textContent = params.bg === 'dark' ? 'Dark bg' : 'Light bg';
    size.textContent = params.size === 'meta' ? 'Test size' : 'Fit';
    title.textContent = '';
    description.textContent = '';
    if (!params.example) {
      stage.replaceChildren(
        h('p', { className: 'hint', textContent: 'Pick an example, or open ?example=<id>.' }),
      );
      return;
    }
    try {
      const mod = await loadExample(params.example);
      if (current !== generation) return;
      title.textContent = mod.meta.title;
      description.textContent = `${mod.meta.description}  [${mod.meta.tags.join(', ')}]`;
      const container = h('div', { className: 'example' });
      if (params.size === 'meta') {
        const { width, height } = mod.meta.size ?? DEFAULT_TEST_SIZE;
        container.classList.add('fixed');
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
      }
      stage.replaceChildren(container);
      setDevicePixelRatio(params.dpr === 'auto' ? null : Number(params.dpr));
      handle = mod.run(container);
      stats.setRenderer(handle.renderer);
      await handle.ready;
    } catch (error) {
      if (current === generation) showError(error);
    }
  };

  const navigate = (patch: Partial<SandboxParams>): void => {
    params = { ...params, ...patch };
    history.pushState(null, '', writeParams(params));
    void mount();
  };

  const step = (delta: number): void => {
    if (!exampleIds.length) return;
    const index = params.example ? exampleIds.indexOf(params.example) : -1;
    const nextIndex = (index + delta + exampleIds.length) % exampleIds.length;
    navigate({ example: exampleIds[nextIndex] ?? null });
  };

  picker.addEventListener('change', () => navigate({ example: picker.value || null }));
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  rerun.addEventListener('click', () => void mount());
  dpr.addEventListener('change', () => navigate({ dpr: dpr.value as SandboxParams['dpr'] }));
  bg.addEventListener('click', () => navigate({ bg: params.bg === 'dark' ? 'light' : 'dark' }));
  size.addEventListener('click', () => navigate({ size: params.size === 'meta' ? 'fit' : 'meta' }));
  window.addEventListener('popstate', () => {
    params = readParams();
    void mount();
  });
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      return;
    }
    if (event.key === ',') step(-1);
    else if (event.key === '.') step(1);
    else if (event.key === 'r') void mount();
  });

  // Editing an example triggers a full reload (URL state is preserved); dispose GPU resources first.
  import.meta.hot?.dispose(() => {
    unmount();
    stats.dispose();
  });

  void mount();
}
