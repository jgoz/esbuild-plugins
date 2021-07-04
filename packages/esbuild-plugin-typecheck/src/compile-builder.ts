import ts from 'typescript';

import type { Builder } from './builder';
import {
  logTypecheckStarted,
  reportDiagnostic,
  reportDiagnostics,
  reportSingleRunResults,
  reportSummaryDiagnostic,
} from './reporters';

export const compileBuilder: Builder = options => {
  const { configFile, commandLine } = options;
  const { options: compilerOptions, fileNames, errors } = commandLine;

  if (compilerOptions.noEmit === undefined) compilerOptions.noEmit = true;

  logTypecheckStarted();

  if (options.watch) {
    ts.createWatchProgram(
      ts.createWatchCompilerHost(
        configFile,
        compilerOptions,
        ts.sys,
        ts.createSemanticDiagnosticsBuilderProgram,
        reportDiagnostic,
        reportSummaryDiagnostic,
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
  }
};
