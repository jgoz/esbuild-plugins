import { watch } from 'chokidar';
import {
  build,
  BuildIncremental,
  BuildInvalidate,
  BuildOptions,
  BuildResult,
  Metafile,
  OutputFile,
} from 'esbuild';
import { EventEmitter } from 'events';

interface BuildIncrementalResult extends BuildIncremental {
  metafile: Metafile;
  outputFiles: OutputFile[];
}

function validateResult(result: BuildResult): asserts result is BuildIncrementalResult {
  if (!result.metafile) throw new Error('incrementalBuild: "metafile" option must be "true"');
  if (!result.outputFiles) throw new Error('incrementalBuild: "write" option must be "false"');
  if (!result.rebuild) throw new Error('incrementalBuild: "incremental" option must be "true"');
}

type BuildIncrementalOptions = BuildOptions & { incremental: true; metafile: true; write: false };

interface IncrementalBuildOptions extends BuildIncrementalOptions {
  absWorkingDir: string;
  onBuildResult: (
    result: BuildIncrementalResult,
    options: BuildIncrementalOptions,
  ) => Promise<void> | void;
  onWatchEvent: (event: string, path: string) => Promise<void> | void;
}

interface IncrementalBuildResult extends BuildIncrementalResult {
  wait(): Promise<void>;
}

export async function incrementalBuild({
  onBuildResult,
  onWatchEvent,
  ...options
}: IncrementalBuildOptions): Promise<IncrementalBuildResult> {
  let rebuild = (() => build(options)) as BuildInvalidate;
  let running = false;

  const basedir = options.absWorkingDir;
  const evt = new EventEmitter();
  const watchedInputs = new Set<string>();
  const watchedModules = new Set<string>();

  const inputWatcher = watch([], {
    cwd: basedir,
    disableGlobbing: true,
    ignored: ['**/node_modules/**'],
  });

  const moduleWatcher = watch([], {
    cwd: basedir,
    depth: 2,
    disableGlobbing: true,
    interval: 2000,
    usePolling: true,
  });

  function onInputEvent(event: string, path: string) {
    if (running) return;
    Promise.resolve(onWatchEvent(event, path))
      .then(triggerBuild)
      .catch(e => console.error(e));
  }

  function onModuleEvent(path: string) {
    if (running) return;
    Promise.resolve(onWatchEvent('change', path))
      .then(triggerBuild)
      .catch(e => console.error(e));
  }

  async function triggerBuild() {
    running = true;
    await inputWatcher.close();
    await moduleWatcher.close();

    const result = await rebuild();
    validateResult(result);

    await onBuildResult(result, options);

    const addedInputs = new Set<string>();
    const addedModules = new Set<string>();
    const removedInputs: string[] = [];
    const removedModules: string[] = [];

    const inputs = Object.keys(result.metafile.inputs);
    for (const input of inputs) {
      const index = input.indexOf('node_modules');
      if (index >= 0) {
        const mod = input.slice(0, index + 'node_modules'.length);
        if (!watchedModules.has(mod)) addedModules.add(mod);
      } else {
        if (!watchedInputs.has(input)) addedInputs.add(input);
      }
    }

    watchedInputs.forEach(input => {
      if (!addedInputs.has(input)) removedInputs.push(input);
    });
    watchedModules.forEach(mod => {
      if (!addedModules.has(mod)) removedModules.push(mod);
    });

    inputWatcher.unwatch(removedInputs);
    moduleWatcher.unwatch(removedModules);

    inputWatcher.add(Array.from(addedInputs));
    moduleWatcher.add(Array.from(addedModules));

    evt.emit('end');

    running = false;
    rebuild = result.rebuild;

    setTimeout(() => {
      if (running) return;
      inputWatcher.once('all', onInputEvent);
      moduleWatcher.once('change', onModuleEvent);
    }, 100);

    return result;
  }

  triggerBuild.dispose = async () => {
    rebuild.dispose();
    await inputWatcher.close();
    await moduleWatcher.close();
  };

  function wait(): Promise<void> {
    if (!running) return Promise.resolve();
    return new Promise(resolve => {
      evt.once('end', resolve);
    });
  }

  const initialResult = await triggerBuild();
  validateResult(initialResult);

  return { ...initialResult, rebuild: triggerBuild, wait };
}
