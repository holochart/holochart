// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * three.js object constructors that must never be created once per data point (plan §3
 * principle 6, E0.5). Use the instanced primitives in `@mk7s/holochart-render` instead.
 */
const PER_POINT_CONSTRUCTORS = new Set([
  'Mesh',
  'Sprite',
  'Points',
  'Line',
  'LineSegments',
  'LineLoop',
]);

/** Array methods whose callback runs once per element. */
const ITERATION_METHODS = new Set(['forEach', 'map', 'flatMap', 'reduce']);

const FUNCTION_TYPES = new Set([
  'FunctionExpression',
  'ArrowFunctionExpression',
  'FunctionDeclaration',
]);

/**
 * @param {any} loop
 * @param {any} child the loop's direct child on the path to the reported node
 */
function isPerIterationPart(loop, child) {
  switch (loop.type) {
    case 'ForStatement':
      return child === loop.body || child === loop.test || child === loop.update;
    case 'ForInStatement':
    case 'ForOfStatement':
      return child === loop.body;
    case 'WhileStatement':
    case 'DoWhileStatement':
      return child === loop.body || child === loop.test;
    default:
      return false;
  }
}

/** @param {any} fn a function node; returns the iteration method name if it is its callback. */
function iterationCallbackMethod(fn) {
  const call = fn.parent;
  if (call?.type !== 'CallExpression' || !call.arguments.includes(fn)) return undefined;
  const callee = call.callee;
  if (callee.type !== 'MemberExpression' || callee.computed) return undefined;
  const name = callee.property.type === 'Identifier' ? callee.property.name : undefined;
  return name && ITERATION_METHODS.has(name) ? name : undefined;
}

/** @param {any} callee */
function constructorName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name;
  }
  return undefined;
}

/** @type {import('eslint').Rule.RuleModule} */
const noPerPointObjects = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow creating three.js Mesh/Sprite/Points/Line objects inside loops or per-element callbacks',
    },
    schema: [],
    messages: {
      loop:
        '`new {{name}}()` inside a loop creates one scene object per data point. Use an instanced ' +
        'primitive from @mk7s/holochart-render (plan §3 principle 6).',
      callback:
        '`new {{name}}()` inside a `.{{method}}()` callback creates one scene object per element. ' +
        'Use an instanced primitive from @mk7s/holochart-render (plan §3 principle 6).',
    },
  },
  create(context) {
    return {
      NewExpression(node) {
        const name = constructorName(node.callee);
        if (!name || !PER_POINT_CONSTRUCTORS.has(name)) return;
        /** @type {any} */
        let child = node;
        /** @type {any} */
        let parent = node.parent;
        while (parent) {
          if (isPerIterationPart(parent, child)) {
            context.report({ node, messageId: 'loop', data: { name } });
            return;
          }
          if (FUNCTION_TYPES.has(parent.type)) {
            const method = iterationCallbackMethod(parent);
            if (method) context.report({ node, messageId: 'callback', data: { name, method } });
            // Any other function is a boundary: it may be called once, not per point.
            return;
          }
          child = parent;
          parent = parent.parent;
        }
      },
    };
  },
};

/** Local plugin (no package): project-specific rules. Exported for its unit tests. */
export const holochartPlugin = {
  meta: { name: 'holochart' },
  rules: { 'no-per-point-objects': noPerPointObjects },
};

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    '**/.turbo/**',
    '**/generated/**',
    '**/*.generated.*',
    'playwright-report/**',
    'test-results/**',
    'tests/visual/__baselines__/**',
    'tests/visual/__actual__/**',
    'tests/visual/__diff__/**',
    'apps/docs/.vitepress/dist/**',
    'apps/docs/.vitepress/cache/**',
    'apps/bench/results/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Node-side code: configs, tooling, tests, scripts.
    files: ['*.{js,ts}', 'tools/**/*.{js,ts}', 'tests/**/*.{js,ts}', '**/*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['packages/*/src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.bench.ts'],
    plugins: { holochart: holochartPlugin },
    rules: { 'holochart/no-per-point-objects': 'error' },
  },
  // Last: turn off stylistic rules that conflict with Prettier.
  prettier,
);
