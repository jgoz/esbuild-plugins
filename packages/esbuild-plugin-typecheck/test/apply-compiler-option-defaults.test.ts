import type ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { applyCompilerOptionDefaults } from '../src/typescript-worker';

describe('applyCompilerOptionDefaults', () => {
  it('defaults noEmit to true when unset', () => {
    const compilerOptions: ts.CompilerOptions = {};
    applyCompilerOptionDefaults(compilerOptions);
    expect(compilerOptions.noEmit).toBe(true);
  });

  it('does not default noEmit when emitDeclarationOnly is set', () => {
    const compilerOptions: ts.CompilerOptions = { emitDeclarationOnly: true };
    applyCompilerOptionDefaults(compilerOptions);
    expect(compilerOptions.noEmit).toBeUndefined();
  });

  it('leaves an explicit noEmit value alone', () => {
    const compilerOptions: ts.CompilerOptions = { noEmit: false };
    applyCompilerOptionDefaults(compilerOptions);
    expect(compilerOptions.noEmit).toBe(false);
  });
});
