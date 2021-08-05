import { watch } from 'chokidar';
import type { BuildIncremental, BuildResult } from 'esbuild';
import { EventEmitter } from 'events';

interface IncrementalBuilderOptions {
  basedir: string;
  onBuildResult: (result: BuildResult) => void | Promise<void>;
  onWatchEvent: (event: string, path: string) => void;
}

export function incrementalBuilder({
  basedir,
  onBuildResult,
  onWatchEvent,
}: IncrementalBuilderOptions) {
  let rebuild: (() => Promise<BuildIncremental>) | undefined;
  let running = false;

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
    void triggerBuild();
    onWatchEvent(event, path);
  }

  function onModuleEvent(path: string) {
    if (running) return;
    void triggerBuild();
    onWatchEvent('change', path);
  }

  async function triggerBuild(build = rebuild) {
    if (!build) throw new Error('Build or rebuild function is required');

    running = true;
    inputWatcher.removeAllListeners();
    moduleWatcher.removeAllListeners();

    const result = await build();
    await onBuildResult(result);

    if (!result.metafile) throw new Error('"metafile" option must be set');
    const inputs = Object.keys(result.metafile.inputs);

    const addedInputs = new Set<string>();
    const addedModules = new Set<string>();
    const removedInputs: string[] = [];
    const removedModules: string[] = [];

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

  function wait(): Promise<void> {
    if (!running) return Promise.resolve();
    return new Promise(resolve => {
      evt.once('end', resolve);
    });
  }

  return { build: triggerBuild, wait };
}
