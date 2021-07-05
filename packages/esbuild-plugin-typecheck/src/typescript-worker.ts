import type { Message } from 'esbuild';
import ts from 'typescript';
import { isMainThread, MessagePort, parentPort, workerData } from 'worker_threads';

import { Reporter } from './reporter';

export interface EsbuildDiagnosticOutput {
  pretty: string;
  standard: string;
}

export interface EsbuildDiagnosticMessage {
  type: 'error' | 'warning';
  message: Message;
}

export interface WorkerDiagnosticsMessage {
  type: 'diagnostic' | 'summary';
  diagnostics: readonly EsbuildDiagnosticMessage[];
  output: EsbuildDiagnosticOutput;
}

export interface WorkerBuildMessage {
  type: 'build';
}

export interface WorkerStartMessage {
  type: 'start';
}

export interface WorkerDoneMessage {
  type: 'done';
  errorCount: number;
  duration: number;
}

export type WorkerMessage =
  | WorkerDiagnosticsMessage
  | WorkerBuildMessage
  | WorkerStartMessage
  | WorkerDoneMessage;

export interface TypescriptWorkerOptions {
  basedir: string;
  build: boolean | ts.BuildOptions;
  commandLine: ts.ParsedCommandLine;
  configFile: string;
  watch: boolean;
}

function runCompiler(
  commandLine: ts.ParsedCommandLine,
  host: ts.CompilerHost,
  reporter: Reporter,
  oldProgram: ts.EmitAndSemanticDiagnosticsBuilderProgram | undefined,
) {
  const { options: compilerOptions, fileNames, errors, projectReferences } = commandLine;

  const program = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
    fileNames,
    compilerOptions,
    host,
    oldProgram,
    errors,
    projectReferences,
  );

  const diagnostics = [
    ...program.getConfigFileParsingDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getOptionsDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ];
  reporter.reportDiagnostics(diagnostics);

  const errorCount = diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length;
  reporter.reportBuildDone(errorCount);

  return program;
}

function startWorker(options: TypescriptWorkerOptions, port: MessagePort) {
  const { basedir, build, configFile, commandLine, watch } = options;
  const reporter = new Reporter(basedir, msg => port.postMessage(msg));

  const { options: compilerOptions } = commandLine;
  if (compilerOptions.noEmit === undefined) compilerOptions.noEmit = true;

  const listen = watch ? port.on.bind(port) : port.once.bind(port);

  if (build) {
    const builderHost = ts.createSolutionBuilderWithWatchHost(
      ts.sys,
      ts.createSemanticDiagnosticsBuilderProgram,
      reporter.reportDiagnostic,
      reporter.reportSummaryDiagnostic,
      reporter.reportSummaryDiagnostic,
    );

    const buildOptions = typeof build === 'boolean' ? {} : build;
    const builder = ts.createSolutionBuilderWithWatch(builderHost, [configFile], {
      incremental: true,
      ...buildOptions,
    });

    let firstRun = true;

    listen('message', (msg: WorkerMessage) => {
      if (msg.type === 'build') {
        if (firstRun) {
          reporter.reportBuildStart();
          firstRun = false;
        }
        reporter.markBuildStart();
        builder.build(configFile);
      }
    });
  } else {
    let builderProgram: ts.EmitAndSemanticDiagnosticsBuilderProgram | undefined;
    const compilerHost = ts.createIncrementalCompilerHost(compilerOptions, ts.sys);

    listen('message', (msg: WorkerMessage) => {
      if (msg.type === 'build') {
        reporter.reportBuildStart();
        reporter.markBuildStart();
        builderProgram = runCompiler(commandLine, compilerHost, reporter, builderProgram);
      }
    });
  }
}

if (!isMainThread && parentPort) {
  const workerOptions = workerData as TypescriptWorkerOptions;
  if (!workerOptions || !workerOptions.basedir || !workerOptions.commandLine) {
    throw new Error(
      `compiler-builder (worker) expected valid builder options as workerData, got "${JSON.stringify(
        workerData,
      )}"`,
    );
  }

  startWorker(workerOptions, parentPort);
}
