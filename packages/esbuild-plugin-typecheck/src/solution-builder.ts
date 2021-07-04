import ts from 'typescript';
import { isMainThread, MessagePort, parentPort, workerData } from 'worker_threads';

import type { Builder, BuilderOptions, DoneMessage, PostedDiagnosticMessage } from './builder';
import {
  logTypecheckStarted,
  reportDiagnostic,
  reportSingleRunResults,
  reportSummaryDiagnostic,
} from './reporters';

export const solutionBuilder: Builder = options => {
  const { configFile, watch } = options;

  const report = (diagnostic: ts.Diagnostic) => {
    reportDiagnostic(diagnostic);
    options.onDiagnostic?.(diagnostic);
  };

  const reportSummary = (diagnostic: ts.Diagnostic) => {
    reportSummaryDiagnostic(diagnostic);
    options.onSummaryDiagnostic?.(diagnostic);
  };

  const reportSingleRun = (errorCount: number) => {
    reportSingleRunResults(errorCount);
    options.onDone?.(errorCount);
  };

  const builder = watch
    ? ts.createSolutionBuilderWithWatch(
        ts.createSolutionBuilderWithWatchHost(
          ts.sys,
          ts.createSemanticDiagnosticsBuilderProgram,
          report,
          reportSummary,
          reportSummary,
        ),
        [configFile],
        { incremental: true },
      )
    : ts.createSolutionBuilder(
        ts.createSolutionBuilderHost(
          ts.sys,
          ts.createSemanticDiagnosticsBuilderProgram,
          report,
          reportSummary,
          reportSingleRun,
        ),
        [configFile],
        {},
      );

  logTypecheckStarted({ build: true, watch });
  builder.buildReferences(configFile);
};

function startWorker(builderOptions: BuilderOptions, port: MessagePort) {
  builderOptions.onDiagnostic = diagnostic => {
    const msg: PostedDiagnosticMessage = { type: 'diagnostic', diagnostic };
    port.postMessage(msg);
  };
  builderOptions.onSummaryDiagnostic = diagnostic => {
    const msg: PostedDiagnosticMessage = { type: 'summary', diagnostic };
    port.postMessage(msg);
  };
  builderOptions.onDone = errorCount => {
    const msg: DoneMessage = { type: 'done', errorCount };
    port.postMessage(msg);
  };

  solutionBuilder(builderOptions);
}

if (!isMainThread && parentPort) {
  const builderOptions = workerData as BuilderOptions;
  if (!builderOptions || !builderOptions.basedir || !builderOptions.commandLine) {
    throw new Error(
      `compiler-builder (worker) expected valid builder options as workerData, got "${JSON.stringify(
        workerData,
      )}"`,
    );
  }

  startWorker(builderOptions, parentPort);
}
