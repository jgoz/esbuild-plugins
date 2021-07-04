import { bold } from 'kleur';
import ts from 'typescript';

const SUCCESS = process.platform === 'win32' ? '√' : '✔';
// const WARNING = process.platform === 'win32' ? '‼' : '⚠';
const ERROR = process.platform === 'win32' ? '×' : '✖';
const INFO = process.platform === 'win32' ? 'i' : 'ℹ';

export function logTypecheckStarted() {
  console.info(bold().cyan(INFO) + bold(' Typecheck started…'));
}

export function logTypecheckPassed() {
  console.info(bold().green(SUCCESS) + bold(' Typecheck passed'));
}

export function logTypecheckFailed(numErrors: string) {
  console.error(bold().red(ERROR) + bold(' Typecheck failed with ' + numErrors));
}

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: path => path,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getNewLine: () => ts.sys.newLine,
};

function extractErrorCount(msg: string): string {
  const match = /Found (\d+ errors?)/.exec(msg);
  return match ? match[1] : '0 errors';
}

export function reportDiagnostic(diagnostic: ts.Diagnostic) {
  reportDiagnostics([diagnostic]);
}

export function reportDiagnostics(diagnostics: readonly ts.Diagnostic[]) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
}

export function reportSummaryDiagnostic(diagnostic: ts.Diagnostic) {
  switch (diagnostic.code) {
    case 6193: // Found 1 error. Watching for file changes.
    case 6194: // Found {0} errors. Watching for file changes.
      if (typeof diagnostic.messageText === 'string') {
        if (diagnostic.messageText.includes('0 errors')) {
          logTypecheckPassed();
        } else {
          logTypecheckFailed(extractErrorCount(diagnostic.messageText));
        }
        break;
      }

    case 6031: // Starting compilation in watch mode...
      break;

    case 6032: // File change detected. Starting incremental compilation...
      logTypecheckStarted();
      break;

    default:
      console.info(ts.formatDiagnosticsWithColorAndContext([diagnostic], formatHost));
  }
}

export function reportSingleRunResults(errorCount: number) {
  if (errorCount) {
    logTypecheckFailed(errorCount === 1 ? '1 error' : `${errorCount} errors`);
  } else {
    logTypecheckPassed();
  }
}
