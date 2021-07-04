import type ts from 'typescript';

export interface BuilderOptions {
  basedir: string;
  commandLine: ts.ParsedCommandLine;
  configFile: string;
  watch: boolean;
}

export type Builder = (options: BuilderOptions) => void;
