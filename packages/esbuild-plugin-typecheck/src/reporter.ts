import { bold, cyan, green } from 'kleur';
import ts from 'typescript';

const SUCCESS = process.platform === 'win32' ? '√' : '✔';
// const WARNING = process.platform === 'win32' ? '‼' : '⚠';
const ERROR = process.platform === 'win32' ? '×' : '✖';
const INFO = process.platform === 'win32' ? 'i' : 'ℹ';

export interface WorkerDiagnosticMessage {
  type: 'diagnostic' | 'summary';
  diagnostic: ts.Diagnostic;
}

export interface WorkerDoneMessage {
  type: 'done';
  errorCount: number;
}

export type WorkerMessage = WorkerDiagnosticMessage | WorkerDoneMessage;

export class Reporter {
  constructor(private readonly postMessage: (msg: WorkerMessage) => void = () => {}) {}

  public logStarted({ build = false, watch = false } = {}) {
    const opts = [build && 'build', watch && 'watch'].filter(Boolean).join(', ');
    const optStr = opts ? cyan(` (${opts})`) : '';

    console.info(bold(INFO) + `  Typecheck started…` + optStr);
  }

  public logPassed() {
    console.info(bold(SUCCESS) + green('  Typecheck passed'));
  }

  public logFailed(numErrors: string) {
    console.error(bold().red(ERROR) + '  Typecheck failed with ' + bold(numErrors));
  }

  public reportDiagnostic = (diagnostic: ts.Diagnostic) => {
    this.reportDiagnostics([diagnostic]);
  };

  public reportDiagnostics = (diagnostics: readonly ts.Diagnostic[]) => {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, Reporter.formatHost));

    diagnostics.forEach(diagnostic => this.postMessage({ type: 'diagnostic', diagnostic }));
  };

  public reportSummaryDiagnostic = (diagnostic: ts.Diagnostic) => {
    switch (diagnostic.code) {
      case 6193: // Found 1 error. Watching for file changes.
      case 6194: // Found {0} errors. Watching for file changes.
        if (typeof diagnostic.messageText === 'string') {
          if (diagnostic.messageText.includes('0 errors')) {
            this.logPassed();
          } else {
            this.logFailed(Reporter.extractErrorCount(diagnostic.messageText));
          }
          break;
        }

      case 6032: // File change detected. Starting incremental compilation...
        this.logStarted();
        break;

      case 6031: // Starting compilation in watch mode...
        return; // Don't log these

      default:
        console.info(ts.formatDiagnosticsWithColorAndContext([diagnostic], Reporter.formatHost));
        break;
    }
    this.postMessage({ type: 'summary', diagnostic });
  };

  public reportSingleRunResults = (errorCount: number) => {
    if (errorCount) {
      this.logFailed(errorCount === 1 ? '1 error' : `${errorCount} errors`);
    } else {
      this.logPassed();
    }
    this.postMessage({ type: 'done', errorCount });
  };

  private static readonly formatHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: path => path,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  };

  private static extractErrorCount(msg: string): string {
    const match = /Found (\d+ errors?)/.exec(msg);
    return match ? match[1] : '0 errors';
  }
}
