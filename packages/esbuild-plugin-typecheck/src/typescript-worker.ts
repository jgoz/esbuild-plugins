import ts from 'typescript';
import { isMainThread, parentPort, workerData } from 'worker_threads';

import { Reporter, WorkerMessage } from './reporter';

export interface TypescriptWorkerOptions {
  basedir: string;
  build: boolean | ts.BuildOptions;
  commandLine: ts.ParsedCommandLine;
  configFile: string;
  watch: boolean;
}

function compileRun(commandLine: ts.ParsedCommandLine, reporter: Reporter) {
  const { options: compilerOptions, fileNames, errors } = commandLine;
  if (compilerOptions.noEmit === undefined) compilerOptions.noEmit = true;

  const program = ts.createProgram({
    options: compilerOptions,
    rootNames: fileNames,
    configFileParsingDiagnostics: errors,
  });

  const { diagnostics } = program.emit();
  const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(diagnostics, errors);
  const errorCount = allDiagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length;

  reporter.reportDiagnostics(allDiagnostics);
  reporter.reportSingleRunResults(errorCount);
}

function compileWatch(configFile: string, commandLine: ts.ParsedCommandLine, reporter: Reporter) {
  const { options: compilerOptions } = commandLine;
  if (compilerOptions.noEmit === undefined) compilerOptions.noEmit = true;

  ts.createWatchProgram(
    ts.createWatchCompilerHost(
      configFile,
      compilerOptions,
      ts.sys,
      ts.createSemanticDiagnosticsBuilderProgram,
      reporter.reportDiagnostic,
      reporter.reportSummaryDiagnostic,
    ),
  );
}

function buildWatch(configFile: string, build: ts.BuildOptions, reporter: Reporter) {
  ts.createSolutionBuilderWithWatch(
    ts.createSolutionBuilderWithWatchHost(
      ts.sys,
      ts.createSemanticDiagnosticsBuilderProgram,
      reporter.reportDiagnostic,
      reporter.reportSummaryDiagnostic,
      reporter.reportSummaryDiagnostic,
    ),
    [configFile],
    { incremental: true, ...build },
  ).buildReferences(configFile);
}

function buildRun(configFile: string, build: ts.BuildOptions, reporter: Reporter) {
  ts.createSolutionBuilder(
    ts.createSolutionBuilderHost(
      ts.sys,
      ts.createSemanticDiagnosticsBuilderProgram,
      reporter.reportDiagnostic,
      reporter.reportSummaryDiagnostic,
      reporter.reportSingleRunResults,
    ),
    [configFile],
    build,
  ).buildReferences(configFile);
}

function startWorker(
  builderOptions: TypescriptWorkerOptions,
  postMessage: (msg: WorkerMessage) => void,
) {
  const { build, configFile, commandLine, watch } = builderOptions;

  const reporter = new Reporter(postMessage);
  reporter.logStarted({ build: !!build, watch });

  if (build) {
    const buildOptions = typeof build === 'boolean' ? {} : build;
    if (watch) {
      buildWatch(configFile, buildOptions, reporter);
    } else {
      buildRun(configFile, buildOptions, reporter);
    }
  } else {
    if (watch) {
      compileWatch(configFile, commandLine, reporter);
    } else {
      compileRun(commandLine, reporter);
    }
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

  startWorker(workerOptions, msg => parentPort?.postMessage(msg));
}
