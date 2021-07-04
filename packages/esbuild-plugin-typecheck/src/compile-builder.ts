import ts from 'typescript';
import { isMainThread, MessagePort, parentPort, workerData } from 'worker_threads';

import type { Builder, BuilderOptions, DoneMessage, PostedDiagnosticMessage } from './builder';
import {
  logTypecheckStarted,
  reportDiagnostic,
  reportDiagnostics,
  reportSingleRunResults,
  reportSummaryDiagnostic,
} from './reporters';

export const compileBuilder: Builder = options => {
  const { configFile, commandLine, watch } = options;
  const { options: compilerOptions, fileNames, errors } = commandLine;

  if (compilerOptions.noEmit === undefined) compilerOptions.noEmit = true;

  logTypecheckStarted({ watch });

  if (watch) {
    const report = (diagnostic: ts.Diagnostic) => {
      reportDiagnostic(diagnostic);
      options.onDiagnostic?.(diagnostic);
    };

    const reportSummary = (diagnostic: ts.Diagnostic) => {
      reportSummaryDiagnostic(diagnostic);
      options.onSummaryDiagnostic?.(diagnostic);
    };

    ts.createWatchProgram(
      ts.createWatchCompilerHost(
        configFile,
        compilerOptions,
        ts.sys,
        ts.createSemanticDiagnosticsBuilderProgram,
        report,
        reportSummary,
      ),
    );
  } else {
    const program = ts.createProgram({
      options: compilerOptions,
      rootNames: fileNames,
      configFileParsingDiagnostics: errors,
    });

    const { diagnostics } = program.emit();

    const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(diagnostics, errors);
    const errorCount = allDiagnostics.filter(
      d => d.category === ts.DiagnosticCategory.Error,
    ).length;

    reportDiagnostics(allDiagnostics);
    reportSingleRunResults(errorCount);

    if (options.onDiagnostic) allDiagnostics.forEach(options.onDiagnostic);
    options.onDone?.(errorCount);
  }
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

  compileBuilder(builderOptions);
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
