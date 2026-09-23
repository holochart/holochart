import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { holochartPlugin } from '../../eslint.config.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const rule = holochartPlugin.rules['no-per-point-objects'];
const tester = new RuleTester({ languageOptions: { ecmaVersion: 2023, sourceType: 'module' } });

tester.run('holochart/no-per-point-objects', rule, {
  valid: [
    'const mesh = new Mesh(geometry, material);',
    'const mesh = new InstancedMesh(geometry, material, points.length);',
    'for (const p of points) { matrix.setPosition(p.x, p.y, 0); }',
    // Loop initializers run once.
    'for (let m = new Mesh(); i < n; i++) {}',
    // A function defined in a loop is a boundary (it may be called once).
    'for (const p of points) { handlers.push(function make() { return new Mesh(); }); }',
    'points.filter((p) => p.visible);',
    'traces.forEach((t) => build(t));',
    'const layers = [a, b].find(() => new Mesh());',
  ],
  invalid: [
    {
      code: 'for (const p of points) { scene.add(new Mesh(geometry, material)); }',
      errors: [{ messageId: 'loop' }],
    },
    {
      code: 'for (let i = 0; i < n; i++) { const s = new THREE.Sprite(material); }',
      errors: [{ messageId: 'loop' }],
    },
    {
      code: 'while (i--) objects.push(new Points(g, m));',
      errors: [{ messageId: 'loop' }],
    },
    {
      code: 'do { new Line(g, m); } while (more());',
      errors: [{ messageId: 'loop' }],
    },
    {
      code: 'for (const k in byKey) { if (k) { const l = new LineSegments(g, m); } }',
      errors: [{ messageId: 'loop' }],
    },
    {
      code: 'points.forEach((p) => scene.add(new Mesh(g, m)));',
      errors: [{ messageId: 'callback', data: { name: 'Mesh', method: 'forEach' } }],
    },
    {
      code: 'const sprites = points.map(function (p) { return new Sprite(material); });',
      errors: [{ messageId: 'callback', data: { name: 'Sprite', method: 'map' } }],
    },
  ],
});
