import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

function setup(fixtureDirSrc: string, fixtureDirOut: string) {
  function copySrcFile(src: string) {
    fs.copyFileSync(path.join(fixtureDirSrc, src), path.join(fixtureDirOut, 'src/index.ts'));
  }

  async function init() {
    await fs.promises.mkdir(path.join(fixtureDirOut, 'src'), { recursive: true });
    await Promise.all([
      fs.promises.copyFile(
        path.join(fixtureDirSrc, 'build.mjs'),
        path.join(fixtureDirOut, 'build.mjs'),
      ),
      fs.promises.copyFile(
        path.join(fixtureDirSrc, 'tsconfig.json'),
        path.join(fixtureDirOut, 'tsconfig.json'),
      ),
    ]);
  }

  async function cleanup() {
    await fs.promises.rm(fixtureDirOut, { recursive: true });
  }

  async function run(args: string[], copyQueue: string[], killOnQueueEnd = false) {
    const queue = [...copyQueue];

    const file = queue.shift();
    if (!file) throw new Error('At least one file should be in the queue');
    copySrcFile(file);

    const abort = new AbortController();
    const proc = spawn('node', [`${fixtureDirOut}/build.mjs`, ...args], {
      env: { ...process.env, FORCE_COLOR: '0' },
      signal: abort.signal,
    });
    const output: string[] = [];

    function processOutput(txt: string, prefix: string) {
      const trimmed = txt.trim();
      if (!trimmed) return;
      const lines = trimmed.split(os.EOL);
      output.push(
        ...lines
          .map(l => (/Typecheck finished in/.exec(l) ? 'ℹ  Typecheck finished in TIME' : l))
          .map(l => `${prefix} ${l}`),
      );

      if (lines.some(l => /Typecheck finished in/.exec(l))) {
        const file = queue.shift();
        if (file) {
          copySrcFile(file);
        } else if (killOnQueueEnd) {
          proc.kill('SIGINT');
        }
      }
    }

    proc.stdout.setEncoding('utf-8');
    proc.stderr.setEncoding('utf-8');

    proc.stdout.on('data', o => processOutput(o, 'OUT'));
    proc.stderr.on('data', o => processOutput(o, 'ERR'));

    const code = await new Promise<number>(resolve => {
      proc.on('exit', resolve);
    });

    return { code: code ?? proc.exitCode, output };
  }

  return { copySrcFile, cleanup, init, run };
}

describe('eslint-plugin-typecheck', () => {
  describe('compile, once', () => {
    const build = setup(
      path.join(__dirname, 'fixture', 'compile'),
      path.join(__dirname, 'fixture', 'compile', 'run'),
    );

    beforeEach(build.init);
    afterEach(build.cleanup);

    it('completes successfully', async () => {
      const { code, output } = await build.run([], ['src/success.ts']);
      expect(code).toBe(0);
      expect(output).toEqual([
        'OUT ℹ  Typecheck started…',
        'OUT ✔  Typecheck passed',
        'OUT ℹ  Typecheck finished in TIME',
      ]);
    });

    it('reports errors', async () => {
      const { code, output } = await build.run([], ['src/error.ts']);
      expect(code).toBe(1);
      expect(output).toEqual([
        'OUT ℹ  Typecheck started…',
        "ERR test/fixture/compile/run/src/index.ts(8,19): error TS2552: Cannot find name 'URL'. Did you mean 'url'?",
        "ERR test/fixture/compile/run/src/index.ts(13,25): error TS2304: Cannot find name 'sourcePath'.",
        'ERR ✖  Typecheck failed with 2 errors',
        'ERR ℹ  Typecheck finished in TIME',
      ]);
    });
  });

  describe('compile, watch', () => {
    const build = setup(
      path.join(__dirname, 'fixture', 'compile'),
      path.join(__dirname, 'fixture', 'compile', 'watch'),
    );

    beforeEach(build.init);
    afterEach(build.cleanup);

    it('watches for changes', async () => {
      const { output } = await build.run(
        ['-w'],
        ['src/success.ts', 'src/error.ts', 'src/success.ts', 'src/error.ts'],
        true,
      );

      expect(output).toEqual([
        'OUT ℹ  Typecheck started…',
        'OUT ✔  Typecheck passed',
        'OUT ℹ  Typecheck finished in TIME',
        'OUT ℹ  Typecheck started…',
        "ERR test/fixture/compile/watch/src/index.ts(8,19): error TS2552: Cannot find name 'URL'. Did you mean 'url'?",
        "ERR test/fixture/compile/watch/src/index.ts(13,25): error TS2304: Cannot find name 'sourcePath'.",
        'ERR ✖  Typecheck failed with 2 errors',
        'ERR ℹ  Typecheck finished in TIME',
        'OUT ℹ  Typecheck started…',
        'OUT ✔  Typecheck passed',
        'OUT ℹ  Typecheck finished in TIME',
        'OUT ℹ  Typecheck started…',
        "ERR test/fixture/compile/watch/src/index.ts(8,19): error TS2552: Cannot find name 'URL'. Did you mean 'url'?",
        "ERR test/fixture/compile/watch/src/index.ts(13,25): error TS2304: Cannot find name 'sourcePath'.",
        'ERR ✖  Typecheck failed with 2 errors',
        'ERR ℹ  Typecheck finished in TIME',
      ]);
    });
  });
});
