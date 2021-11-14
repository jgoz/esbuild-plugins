import type { BuildOptions } from 'esbuild';
import path from 'path';

import type { BuildMode, EsbdConfigWithPlugins } from './config';
import { readTemplate, WriteTemplateOptions } from './html-entry-point';

export interface BuildOptionsWithInvariants extends BuildOptions {
  absWorkingDir: string;
  metafile: true;
  outdir: string;
  write: false;
}

export async function getHtmlBuildOptions(
  [entryPath, entryName]: [string, string | undefined],
  mode: BuildMode,
  config: EsbdConfigWithPlugins,
): Promise<[BuildOptionsWithInvariants, WriteTemplateOptions]> {
  const outdir = config.outdir;
  if (!outdir) throw new Error('"outdir" option must be set');

  const {
    bundle = true,
    copy: _,
    format = 'esm',
    jsxRuntime: __,
    integrity,
    ignoreAssets,
    publicPath = '',
    target = 'es2017',
    ...options
  } = config;

  const absEntryPath = path.resolve(process.cwd(), entryPath);
  const basedir = config.absWorkingDir ?? path.dirname(absEntryPath);

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

  const [entryPoints, writeOptions] = await readTemplate(absEntryPath, {
    basedir,
    define,
    filename: entryName,
    ignoreAssets,
    integrity,
  });

  return [
    {
      ...options,
      absWorkingDir: basedir,
      bundle,
      entryPoints,
      format,
      minify: mode === 'production',
      outdir,
      metafile: true,
      publicPath,
      target,
      sourcemap: config.sourcemap ?? (mode === 'development' ? 'inline' : undefined),
      write: false,
    },
    writeOptions,
  ];
}

export function getBuildOptions(
  [entryPath, entryName]: [string, string | undefined],
  mode: BuildMode,
  config: EsbdConfigWithPlugins,
): BuildOptionsWithInvariants {
  const outdir = config.outdir;
  if (!outdir) throw new Error('"outdir" option must be set');

  const {
    bundle = true,
    copy: _,
    jsxRuntime: __,
    integrity: ___,
    ignoreAssets: ____,
    ...options
  } = config;

  const absEntryPath = path.resolve(config.absWorkingDir ?? process.cwd(), entryPath);
  const basedir = config.absWorkingDir ?? path.dirname(absEntryPath);

  return {
    ...options,
    absWorkingDir: basedir,
    bundle,
    entryPoints: entryName ? { [entryName]: entryPath } : [entryPath],
    minify: mode === 'production',
    metafile: true,
    outdir,
    sourcemap: config.sourcemap ?? (mode === 'development' ? true : undefined),
    write: false,
  };
}
