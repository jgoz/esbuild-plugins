import type { Message } from 'esbuild';
import * as realFS from 'fs';
import { fs as memfs } from 'memfs';
import path, { dirname } from 'path';
import ts from 'typescript';
import { ufs } from 'unionfs';
import type { MessagePort } from 'worker_threads';
import { isMainThread, parentPort, workerData } from 'worker_threads';

import { Reporter } from './reporter';

type BuildMode = 'readonly' | 'write-output';

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
  build?: boolean;
  watch?: boolean;
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
  build?: boolean | ts.BuildOptions;
  buildMode?: BuildMode;
  compilerOptions?: ts.CompilerOptions;
  configFile: string | undefined;
  watch: boolean;
}

/**
 * Creates a ts.System implementation that redirects all write
 * operations to an in-memory FS. Read operations first try the memory
 * FS and fall back to the real FS.
 */
function createPartialMemoryBackedSystem(): ts.System {
  // @ts-expect-error -- IFs and IFS are not compatible...
  const unionfs = ufs.use(memfs).use(realFS);

  const system: ts.System = {
    ...ts.sys,
    createDirectory(path) {
      memfs.mkdirSync(path);
    },
    deleteFile(path) {
      if (memfs.existsSync(path)) memfs.unlinkSync(path);
    },
    directoryExists(path) {
      return unionfs.existsSync(path);
    },
    fileExists(path) {
      return unionfs.existsSync(path);
    },
    getDirectories(path) {
      return unionfs.readdirSync(path, { encoding: 'utf-8', withFileTypes: false });
    },
    getModifiedTime(path) {
      if (!unionfs.existsSync(path)) return undefined;
      const stat = unionfs.statSync(path);
      return stat.mtime;
    },
    getFileSize(path) {
      if (!unionfs.existsSync(path)) return 0;
      const stat = unionfs.statSync(path);
      return stat.size;
    },
    readFile(path, encoding = 'utf-8') {
      if (!unionfs.existsSync(path)) return undefined;
      return unionfs.readFileSync(path, { encoding: encoding as BufferEncoding });
    },
    setModifiedTime(path, time) {
      memfs.utimesSync(path, time, time);
    },
    writeFile(path, data, writeBOM) {
      memfs.mkdirpSync(dirname(path));
      memfs.writeFileSync(path, writeBOM ? '\ufeff' + data : data);
    },
  };

  return system;
}

function createBuilder(
  configFile: string,
  buildOptions: ts.BuildOptions,
  buildMode: BuildMode,
  reporter: Reporter,
) {
  const system = buildMode === 'readonly' ? createPartialMemoryBackedSystem() : ts.sys;
  const builderHost = ts.createSolutionBuilderHost(
    system,
    ts.createSemanticDiagnosticsBuilderProgram,
    reporter.reportDiagnostic,
    reporter.reportSummaryDiagnostic,
    reporter.reportBuildDone,
  );

  const builder = ts.createSolutionBuilder(builderHost, [configFile], buildOptions);

  return [builder, system] as const;
}

function createWatchBuilder(
  configFile: string,
  buildOptions: ts.BuildOptions,
  buildMode: BuildMode,
  reporter: Reporter,
) {
  const system = buildMode === 'readonly' ? createPartialMemoryBackedSystem() : ts.sys;
  const builderHost = ts.createSolutionBuilderWithWatchHost(
    system,
    ts.createSemanticDiagnosticsBuilderProgram,
    reporter.reportDiagnostic,
    reporter.reportSummaryDiagnostic,
    reporter.reportSummaryDiagnostic,
  );

  const builder = ts.createSolutionBuilderWithWatch(
    builderHost,
    [configFile],
    {
      incremental: true,
      ...buildOptions,
    },
    { excludeDirectories: ['node_modules'] },
  );

  return [builder, system] as const;
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
  const {
    basedir,
    buildMode = 'readonly',
    configFile = ts.findConfigFile(basedir, ts.sys.fileExists, 'tsconfig.json'),
    watch,
  } = options;

  if (!configFile) {
    throw new Error(`Could not find a valid "tsconfig.json" (searching in "${basedir}").`);
  }

  const { config } = ts.readConfigFile(configFile, ts.sys.readFile);
  config.compilerOptions = { ...config.compilerOptions, ...options.compilerOptions };

  const commandLine = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configFile));
  const build = options.build ?? commandLine.options.composite ?? false;

  const { options: compilerOptions } = commandLine;

  if (compilerOptions.noEmit === undefined) compilerOptions.noEmit = true;

  const reporter = new Reporter(basedir, msg => port.postMessage(msg));
  const listen = watch ? port.on.bind(port) : port.once.bind(port);

  if (build) {
    const buildOptions = typeof build === 'boolean' ? {} : build;
    const [builder, system] = watch
      ? createWatchBuilder(configFile, buildOptions, buildMode, reporter)
      : createBuilder(configFile, buildOptions, buildMode, reporter);

    let firstRun = true;

    listen('message', (msg: WorkerMessage) => {
      if (msg.type === 'build') {
        if (firstRun) {
          reporter.reportBuildStart();
          firstRun = false;
        }
        reporter.markBuildStart();
        builder.build(configFile, undefined, system.writeFile);
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
  if (!workerOptions?.basedir) {
    throw new Error(
      `compiler-builder (worker) expected valid builder options as workerData, got "${JSON.stringify(
        workerData,
      )}"`,
    );
  }

  startWorker(workerOptions, parentPort);
}
