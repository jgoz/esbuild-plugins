import type { Message } from 'esbuild';
import path from 'path';
import ts from 'typescript';

import type {
  EsbuildDiagnosticMessage,
  EsbuildDiagnosticOutput,
  WorkerMessage,
} from './typescript-worker';

export class Reporter {
  private start = Date.now();

  constructor(
    private readonly basedir: string,
    private readonly postMessage: (msg: WorkerMessage) => void = () => {},
  ) {}

  public markBuildStart() {
    this.start = Date.now();
  }

  public reportBuildStart = ({ build = false, watch = false } = {}) => {
    this.postMessage({ type: 'start', build, watch });
  };

  public reportBuildDone = (errorCount: number) => {
    this.postMessage({ type: 'done', errorCount, duration: Date.now() - this.start });
  };

  public reportDiagnostic = (diagnostic: ts.Diagnostic) => {
    this.reportDiagnostics([diagnostic]);
  };

  public reportDiagnostics = (diagnostics: readonly ts.Diagnostic[]) => {
    this.postMessage({
      type: 'diagnostic',
      diagnostics: Array.from(Reporter.transformDiagnostics(this.basedir, diagnostics)),
      output: Reporter.getOutput(diagnostics),
    });
  };

  public reportSummaryDiagnostic = (diagnostic: ts.Diagnostic) => {
    switch (diagnostic.code) {
      case 6193: // Found 1 error. Watching for file changes.
      case 6194: // Found {0} errors. Watching for file changes.
        if (typeof diagnostic.messageText === 'string') {
          const errorCount = Reporter.extractErrorCount(diagnostic.messageText);
          this.reportBuildDone(errorCount);
          break;
        }

      case 6032: // File change detected. Starting incremental compilation...
        this.reportBuildStart();
        this.markBuildStart(); // If the watcher decides to start on its own, we need to record the start time
        break;

      case 6031: // Starting compilation in watch mode...
        return; // Don't log these

      default:
        this.postMessage({
          type: 'summary',
          diagnostics: Array.from(Reporter.transformDiagnostics(this.basedir, [diagnostic])),
          output: Reporter.getOutput([diagnostic]),
        });
        break;
    }
  };

  private static readonly formatHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: path => path,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  };

  private static extractErrorCount(msg: string): number {
    const match = /Found (\d+) errors?/.exec(msg);
    return match ? Number(match[1]) : 0;
  }

  private static getOutput(diagnostics: readonly ts.Diagnostic[]): EsbuildDiagnosticOutput {
    return {
      pretty: ts.formatDiagnosticsWithColorAndContext(diagnostics, Reporter.formatHost),
      standard: ts.formatDiagnostics(diagnostics, Reporter.formatHost),
    };
  }

  private static *transformDiagnostics(
    basedir: string,
    diagnostics: readonly ts.Diagnostic[],
  ): Iterable<EsbuildDiagnosticMessage> {
    for (const diagnostic of diagnostics) {
      const type =
        diagnostic.category === ts.DiagnosticCategory.Error
          ? 'error'
          : diagnostic.category === ts.DiagnosticCategory.Warning
            ? 'warning'
            : undefined;

      if (!type) continue;

      const { file, length, start } = diagnostic;
      const messageText = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n\n');
      if (!file) continue;

      if (start === undefined || length === undefined) {
        yield {
          type,
          message: {
            id: `TS${diagnostic.code}`,
            detail: diagnostic.relatedInformation,
            location: null,
            notes: [],
            pluginName: 'esbuild-plugin-typecheck',
            text: messageText,
          },
        };
        continue;
      }

      const { line, character } = ts.getLineAndCharacterOfPosition(file, start);
      const lastLineInFile = ts.getLineAndCharacterOfPosition(file, file.text.length).line;

      const lineStart = ts.getPositionOfLineAndCharacter(file, line, 0);
      const lineEnd =
        line < lastLineInFile
          ? ts.getPositionOfLineAndCharacter(file, line + 1, 0)
          : file.text.length;

      const lineText = file.text.slice(lineStart, lineEnd).trimEnd();
      const safeLength =
        character + length > lineEnd - lineStart ? lineEnd - lineStart - character : length;

      const message: Message = {
        id: `TS${diagnostic.code}`,
        detail: undefined,
        location: {
          column: character,
          file: path.relative(basedir, file.fileName),
          length: safeLength,
          line,
          lineText,
          namespace: '',
          suggestion: '',
        },
        pluginName: 'esbuild-plugin-typecheck',
        notes: [],
        text: messageText,
      };
      yield { type, message };
    }
  }
}
