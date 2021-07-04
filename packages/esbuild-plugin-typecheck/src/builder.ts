import type ts from 'typescript';

export interface BuilderOptions {
  basedir: string;
  commandLine: ts.ParsedCommandLine;
  configFile: string;
  watch: boolean;

  onDiagnostic?: (diagnostic: ts.Diagnostic) => void;
  onSummaryDiagnostic?: (diagnostic: ts.Diagnostic) => void;
  onDone?: (errorCount: number) => void;
}

export type Builder = (options: BuilderOptions) => void;

export interface PostedDiagnosticMessage {
  type: 'diagnostic' | 'summary';
  diagnostic: ts.Diagnostic;
}

export interface DoneMessage {
  type: 'done';
  errorCount: number;
}
