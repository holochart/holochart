/**
 * The declaration build keeps exports tagged `@internal` (the packages import them from each
 * other) and leaves out members tagged `@internal` (`scripts/build/tsdown-preset.ts`).
 */
import { describe, expect, it } from 'vitest';
import { stripInternalMembers } from '../../scripts/build/tsdown-preset.ts';

describe('stripInternalMembers', () => {
  it('removes class, interface and type-literal members tagged @internal', () => {
    const code = [
      'export declare class Cell {',
      '  #private;',
      '  /** @internal Use {@link Matrix.createCell}. */',
      '  constructor(matrix: Matrix);',
      '  /** Draws the cell. */',
      '  draw(): void;',
      '  /**',
      '   * Re-reference the buffers.',
      '   * @internal',
      '   */',
      '  relink(): void;',
      '}',
      'export interface Options {',
      '  /** @internal */',
      '  secret?: number;',
      '  size: number;',
      '}',
      'export type Point = {',
      '  x: number;',
      '  /** @internal */ tag: string;',
      '};',
      '',
    ].join('\n');
    expect(stripInternalMembers(code)).toBe(
      [
        'export declare class Cell {',
        '  #private;',
        '  /** Draws the cell. */',
        '  draw(): void;',
        '}',
        'export interface Options {',
        '  size: number;',
        '}',
        'export type Point = {',
        '  x: number;',
        '};',
        '',
      ].join('\n'),
    );
  });

  it('keeps top-level declarations tagged @internal', () => {
    const code = [
      '/** Shared by the trace packages. @internal */',
      'export declare function layoutBars(input: StackInput): StackOutput;',
      '/** @internal */',
      'export interface StackInput {',
      '  /** Bar positions. */',
      '  x: number[];',
      '}',
      '',
    ].join('\n');
    expect(stripInternalMembers(code)).toBe(code);
  });

  it('only looks at the comment right before a member', () => {
    const code = [
      'export interface A {',
      '  /** Mentions @internal names. */',
      '  // a line comment',
      '  kept: number;',
      '}',
      '',
    ].join('\n');
    expect(stripInternalMembers(code)).toBe(code);
  });
});
