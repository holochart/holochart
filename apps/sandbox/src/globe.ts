import { run } from '@mk7s/holochart-examples/demos/pixel-globe.ts';

const demo = run(document.querySelector<HTMLElement>('#app')!);
import.meta.hot?.dispose(() => demo.dispose());
