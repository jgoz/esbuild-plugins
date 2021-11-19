import type { BuildOptions } from 'esbuild';
import path from 'path';

import type { BuildMode, ResolvedEsbdConfig } from './config';
import { EntryPoints, readTemplate, WriteTemplateOptions } from './html-entry-point';

export interface BuildOptionsWithInvariants extends BuildOptions {
  absWorkingDir: string;
  metafile: true;
  outdir: string;
  write: false;
}

export async function getHtmlBuildOptions(
  htmlEntries: (readonly [string, string])[],
  mode: BuildMode,
  config: ResolvedEsbdConfig,
): Promise<[BuildOptionsWithInvariants, WriteTemplateOptions[]]> {
  const outdir = config.outdir;

  const {
    bundle = true,
    copy: _,
    format = 'esm',
    jsxRuntime: __,
    integrity,
    ignoreAssets,
    name: ___,
    publicPath = '',
    target = 'es2017',
    ...options
  } = config;

  const esbuildDefine = config.define ?? {};
  const define: Record<string, any> = {};
  for (const key of Object.keys(esbuildDefine)) {
    const value = esbuildDefine[key];
    if (typeof value === 'string') {
      try {
        define[key] = JSON.parse(value);
      } catch {
        define[key] = value;
      }
    } else {
      define[key] = value;
    }
  }

  let allEntryPoints: EntryPoints = {};
  const allWriteOptions: WriteTemplateOptions[] = [];

  for (const [entryName, entryPath] of htmlEntries) {
    const basedir = config.absWorkingDir;
    const absEntryPath = path.resolve(basedir, entryPath);

    const [entryPoints, writeOptions] = await readTemplate(absEntryPath, {
      basedir,
      define,
      filename: entryName,
      ignoreAssets,
      integrity,
    });

    allEntryPoints = { ...allEntryPoints, ...entryPoints };
    allWriteOptions.push(writeOptions);
  }

  return [
    {
      ...options,
      absWorkingDir: config.absWorkingDir,
      bundle,
      entryPoints: allEntryPoints,
      format,
      minify: mode === 'production',
      outdir,
      metafile: true,
      publicPath,
      target,
      sourcemap: config.sourcemap ?? (mode === 'development' ? 'inline' : undefined),
      write: false,
    },
    allWriteOptions,
  ];
}

export function getBuildOptions(
  entries: (readonly [string, string])[],
  mode: BuildMode,
  config: ResolvedEsbdConfig,
): BuildOptionsWithInvariants {
  const outdir = config.outdir;
  if (!outdir) throw new Error('"outdir" option must be set');

  const {
    bundle = true,
    copy: _,
    jsxRuntime: __,
    integrity: ___,
    ignoreAssets: ____,
    name: _____,
    ...options
  } = config;

  const allEntryPoints: EntryPoints = {};
  for (const [entryName, entryPath] of entries) {
    const absEntryPath = path.resolve(config.absWorkingDir, entryPath);
    allEntryPoints[entryName] = absEntryPath;
  }

  return {
    ...options,
    absWorkingDir: config.absWorkingDir,
    bundle,
    entryPoints: allEntryPoints,
    minify: mode === 'production',
    metafile: true,
    outdir,
    sourcemap: config.sourcemap ?? (mode === 'development' ? true : undefined),
    write: false,
  };
}
