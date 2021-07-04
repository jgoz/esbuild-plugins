import ts from 'typescript';

import type { Builder } from './builder';
import {
  logTypecheckStarted,
  reportDiagnostic,
  reportSingleRunResults,
  reportSummaryDiagnostic,
} from './reporters';

export const solutionBuilder: Builder = options => {
  const { configFile } = options;

  const builder = options.watch
    ? ts.createSolutionBuilderWithWatch(
        ts.createSolutionBuilderWithWatchHost(
          ts.sys,
          ts.createSemanticDiagnosticsBuilderProgram,
          reportDiagnostic,
          reportSummaryDiagnostic,
          reportSummaryDiagnostic,
        ),
        [configFile],
        { incremental: true },
      )
    : ts.createSolutionBuilder(
        ts.createSolutionBuilderHost(
          ts.sys,
          ts.createSemanticDiagnosticsBuilderProgram,
          reportDiagnostic,
          reportSummaryDiagnostic,
          reportSingleRunResults,
        ),
        [configFile],
        {},
      );

  logTypecheckStarted();
  builder.buildReferences(configFile);
};
