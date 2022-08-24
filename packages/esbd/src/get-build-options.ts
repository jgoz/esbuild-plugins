import type { BuildOptions } from 'esbuild';
import path from 'path';

import type { BuildMode, ResolvedEsbdConfig } from './config';
import type { EntryPoints, WriteTemplateOptions } from './html-entry-point';
import { readTemplate } from './html-entry-point';

export interface BuildOptionsWithInvariants extends BuildOptions {
  absWorkingDir: string;
  metafile: true;
  outdir: string;
  write: false;
}

export type HtmlBuildOptions = [BuildOptionsWithInvariants, WriteTemplateOptions[]];

export async function getHtmlBuildOptions(
  htmlEntries: (readonly [string, string])[],
  mode: BuildMode,
  config: ResolvedEsbdConfig,
): Promise<HtmlBuildOptions> {
  const outdir = config.outdir;

  const {
    copy: _,
    cssChunkFilter,
    format = 'esm',
    integrity,
    ignoreAssets,
    name: __,
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
    if (!entryPath.endsWith('.html')) {
      allEntryPoints = { ...allEntryPoints, [entryName]: entryPath };
      continue;
    }

    const basedir = config.absWorkingDir;
    const absEntryPath = path.resolve(basedir, entryPath);

    const writeOptions = await readTemplate(absEntryPath, {
      basedir,
      define,
      filename: entryName,
      cssChunkFilter,
      ignoreAssets,
      integrity,
    });

    allEntryPoints = { ...allEntryPoints, ...writeOptions.htmlEntryPoints };
    allWriteOptions.push(writeOptions);
  }

  return [
    {
      ...options,
      absWorkingDir: config.absWorkingDir,
      bundle: true,
      entryPoints: allEntryPoints,
      format,
      minify: mode === 'production',
      outdir,
      metafile: true,
      publicPath,
      target,
      sourcemap: config.sourcemap ?? (mode === 'development' ? true : undefined),
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
    copy: _,
    cssChunkFilter: __,
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
    bundle: true,
    entryPoints: allEntryPoints,
    minify: mode === 'production',
    metafile: true,
    outdir,
    sourcemap: config.sourcemap ?? (mode === 'development' ? true : undefined),
    write: false,
  };
}
