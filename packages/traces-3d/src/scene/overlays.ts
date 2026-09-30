/**
 * The scene component's hover side (plan E14.1d): per scene, the GPU picker 3D hover reads
 * (`pick.ts`), the spikes of the hovered point (`spikes.ts`) and `scene.annotations`
 * (`annotations.ts`); plus the `click` event, which the runtime can't emit for scenes (a press in
 * a scene starts the component's camera gesture): as in Plotly, a click emits the hovered point.
 */
import type { FullLayout } from '@mk7s/holochart-core';
import type {
  Chart,
  ChartPoint,
  ComponentDrawContext,
  ComponentPointerEvent,
} from '@mk7s/holochart-runtime';
import { SceneAnnotations } from './annotations.ts';
import { sceneHoveredPosition } from './hover.ts';
import { isSceneTrace, sceneOf } from './layout-defaults.ts';
import { attachScenePicking, disposeScenePicker } from './pick.ts';
import type { Scene3D } from './scene.ts';
import { SceneSpikes } from './spikes.ts';

interface PerScene {
  readonly spikes: SceneSpikes;
  readonly annotations: SceneAnnotations;
  readonly off: () => void;
}

/** Spikes, annotations, picking and clicks of a chart's scenes (see the module comment). */
export class SceneOverlays {
  #ctx: ComponentDrawContext;
  readonly #scenes = new Map<Scene3D, PerScene>();
  #chart: Chart | undefined;
  /** The render root whose picker the scenes use. */
  #root: object | undefined;
  #offChart: (() => void)[] = [];
  /** The points of the latest `hover` event (cleared by `unhover`). */
  #hovered: readonly ChartPoint[] = [];

  constructor(ctx: ComponentDrawContext) {
    this.#ctx = ctx;
  }

  sync(ctx: ComponentDrawContext, scenes: readonly Scene3D[]): void {
    this.#ctx = ctx;
    const chart = ctx.chart;
    if (chart !== this.#chart) this.#listen(chart);
    for (const scene of scenes) {
      let s = this.#scenes.get(scene);
      if (!s) {
        const spikes = new SceneSpikes(ctx, scene);
        s = {
          spikes,
          annotations: new SceneAnnotations(ctx, scene),
          // Spikes belong to the view they were drawn for; hover brings them back.
          off: scene.onCameraChange(() => spikes.hide()),
        };
        this.#scenes.set(scene, s);
      } else s.spikes.update(ctx);
      s.annotations.update(ctx);
      if (chart && !chart.interaction.staticPlot) {
        const root = chart.three.root;
        if (this.#root && root !== this.#root) disposeScenePicker(this.#root);
        this.#root = root;
        attachScenePicking(scene, chart);
      }
    }
    for (const [scene, s] of this.#scenes) {
      if (scenes.includes(scene)) continue;
      this.#drop(s);
      this.#scenes.delete(scene);
    }
  }

  /** Annotations with `captureevents` first; a click in a scene emits the hovered point. */
  handlePointer(event: ComponentPointerEvent, scene: Scene3D | undefined): boolean {
    for (const s of this.#scenes.values()) {
      if (s.annotations.handlePointer(event)) return true;
    }
    if (event.type === 'click' && scene) this.#click(event, scene);
    return false;
  }

  dispose(): void {
    for (const off of this.#offChart) off();
    this.#offChart = [];
    for (const s of this.#scenes.values()) this.#drop(s);
    this.#scenes.clear();
    if (this.#root) disposeScenePicker(this.#root);
    this.#root = undefined;
  }

  #drop(s: PerScene): void {
    s.off();
    s.spikes.dispose();
    s.annotations.dispose();
  }

  #listen(chart: Chart | undefined): void {
    for (const off of this.#offChart) off();
    this.#offChart = [];
    this.#chart = chart;
    if (!chart) return;
    this.#offChart.push(
      chart.on('hover', (e) => {
        this.#hovered = e.points;
        this.#showSpikes(e.points[0]);
      }),
      chart.on('unhover', () => {
        this.#hovered = [];
        this.#showSpikes(undefined);
      }),
    );
  }

  /** Spikes for the winning hovered point, if it is a 3D trace's; hidden everywhere else. */
  #showSpikes(point: ChartPoint | undefined): void {
    const trace = point?.fullData;
    const i = point?.pointNumber;
    const at =
      trace && typeof i === 'number' && isSceneTrace(trace)
        ? sceneHoveredPosition(this.#ctx.fullLayout as FullLayout, trace, i)
        : undefined;
    for (const [scene, s] of this.#scenes) {
      if (at && at.scene === scene) s.spikes.show(at.world);
      else s.spikes.hide();
    }
  }

  #click(event: ComponentPointerEvent, scene: Scene3D): void {
    const chart = this.#chart;
    if (!chart || !chart.interaction.clickEvent) return;
    const points = this.#hovered.filter(
      (p) => isSceneTrace(p.fullData) && sceneOf(p.fullData) === scene.id,
    );
    if (points.length === 0) return;
    chart.emit('click', {
      points,
      ...(event.native ? { event: event.native as Event } : {}),
    });
  }
}
