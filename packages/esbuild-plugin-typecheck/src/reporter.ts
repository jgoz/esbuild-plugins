import { bold, cyan, green } from 'kleur';
import ts from 'typescript';

import type { WorkerMessage } from './typescript-worker';

const SUCCESS = process.platform === 'win32' ? '√' : '✔';
// const WARNING = process.platform === 'win32' ? '‼' : '⚠';
const ERROR = process.platform === 'win32' ? '×' : '✖';
const INFO = process.platform === 'win32' ? 'i' : 'ℹ';

export class Reporter {
  constructor(private readonly postMessage: (msg: WorkerMessage) => void = () => {}) {}

  public reportBuildStart = ({ build = false, watch = false } = {}) => {
    this.logStarted({ build, watch });
    this.postMessage({ type: 'start' });
  };

  public reportDiagnostic = (diagnostic: ts.Diagnostic) => {
    this.reportDiagnostics([diagnostic]);
  };

  public reportDiagnostics = (diagnostics: readonly ts.Diagnostic[]) => {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, Reporter.formatHost));
    this.postMessage({ type: 'diagnostic', diagnostics });
  };

  public reportSummaryDiagnostic = (diagnostic: ts.Diagnostic) => {
    switch (diagnostic.code) {
      case 6193: // Found 1 error. Watching for file changes.
      case 6194: // Found {0} errors. Watching for file changes.
        if (typeof diagnostic.messageText === 'string') {
          const errorCount = Reporter.extractErrorCount(diagnostic.messageText);
          this.reportSingleRunResults(errorCount);
          break;
        }

      case 6032: // File change detected. Starting incremental compilation...
        this.reportBuildStart();
        break;

      case 6031: // Starting compilation in watch mode...
        return; // Don't log these

      default:
        console.info(ts.formatDiagnosticsWithColorAndContext([diagnostic], Reporter.formatHost));
        this.postMessage({
          type: 'summary',
          diagnostics: [diagnostic],
        });
        break;
    }
  };

  public reportSingleRunResults = (errorCount: number) => {
    if (errorCount) {
      this.logFailed(errorCount === 1 ? '1 error' : `${errorCount} errors`);
    } else {
      this.logPassed();
    }
    this.postMessage({ type: 'done', errorCount });
  };

  private logStarted({ build = false, watch = false } = {}) {
    const opts = [build && 'build', watch && 'watch'].filter(Boolean).join(', ');
    const optStr = opts ? cyan(` (${opts})`) : '';

    console.info(bold(INFO) + `  Typecheck started…` + optStr);
  }

  private logPassed() {
    console.info(bold(SUCCESS) + green('  Typecheck passed'));
  }

  private logFailed(numErrors: string) {
    console.error(bold().red(ERROR) + '  Typecheck failed with ' + bold(numErrors));
  }

  private static readonly formatHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: path => path,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  };

  private static extractErrorCount(msg: string): number {
    const match = /Found (\d+) errors?/.exec(msg);
    return match ? Number(match[1]) : 0;
  }
}
