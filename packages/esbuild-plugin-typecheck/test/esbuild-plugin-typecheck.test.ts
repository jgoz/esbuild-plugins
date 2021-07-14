import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function* walk(dirPath: string): AsyncIterable<string> {
  for await (const d of await fs.promises.readdir(dirPath, { withFileTypes: true })) {
    const entry = path.join(dirPath, d.name);
    if (d.isDirectory()) yield* walk(entry);
    else if (d.isFile()) yield entry;
  }
}

interface RunOptions {
  buildMode?: 'readonly' | 'write-output';
  watch?: boolean;
}

function setup(fixtureDirSrc: string, fixtureDirOut: string) {
  function copySrcFile(src: string, out: string) {
    fs.copyFileSync(path.join(fixtureDirSrc, src), path.join(fixtureDirOut, out));
  }

  async function init() {
    for await (const src of walk(fixtureDirSrc)) {
      const out = path.join(fixtureDirOut, path.relative(fixtureDirSrc, src));
      await fs.promises.mkdir(path.dirname(out), { recursive: true });
      await fs.promises.copyFile(src, out);
    }
  }

  async function cleanup() {
    await fs.promises.rm(fixtureDirOut, { recursive: true });
  }

  async function run(
    script: string,
    copyQueue: [string, string][],
    { buildMode, watch }: RunOptions = {},
  ) {
    const queue = [...copyQueue];

    if (!watch) {
      for (const [from, to] of queue) {
        copySrcFile(from, to);
      }
    }

    const scriptPath = path.join(fixtureDirOut, script);
    const proc = spawn('node', [scriptPath], {
      cwd: path.dirname(scriptPath),
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        BUILD_MODE: buildMode,
        WATCH: watch ? 'true' : undefined,
      },
    });
    const output: string[] = [];

    function processOutput(txt: string, prefix: string) {
      const lines = txt
        .split(os.EOL)
        .map(line => line.trimEnd())
        .filter(Boolean);

      if (!lines.length) return;

      output.push(
        ...lines
          .map(l => l.replace(/Typecheck finished in (\d+ms)/, 'Typecheck finished in TIME'))
          .map(l => `${prefix} ${l}`),
      );

      if (watch && lines.some(l => /Typecheck finished in/.exec(l))) {
        const files = queue.shift();
        if (files) {
          copySrcFile(...files);
        } else {
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

  async function findTSOutput() {
    const tsOutput: string[] = [];
    for await (const file of walk(fixtureDirOut)) {
      const rel = path.relative(fixtureDirOut, file);
      const parts = rel.split(path.sep);
      if (parts.includes('types') || parts.includes('build')) {
        tsOutput.push(rel);
      }
    }
    return tsOutput;
  }

  return { copySrcFile, cleanup, init, run, findTSOutput };
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
      const { code, output } = await build.run('build.mjs', [['src/index.ts', 'src/index.ts']]);
      expect(code).toBe(0);
      expect(output).toEqual([
        'OUT ℹ  Typecheck started…',
        'OUT ✔  Typecheck passed',
        'OUT ℹ  Typecheck finished in TIME',
      ]);
    });

    it('reports errors', async () => {
      const { code, output } = await build.run('build.mjs', [
        ['src/index-error.ts', 'src/index.ts'],
      ]);
      expect(code).toBe(1);
      expect(output).toEqual([
        'OUT ℹ  Typecheck started…',
        "ERR src/index.ts(8,19): error TS2552: Cannot find name 'URL'. Did you mean 'url'?",
        "ERR src/index.ts(13,25): error TS2304: Cannot find name 'sourcePath'.",
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
        'build.mjs',
        [
          ['src/index-error.ts', 'src/index.ts'],
          ['src/index.ts', 'src/index.ts'],
          ['src/index-error.ts', 'src/index.ts'],
        ],
        { watch: true },
      );

      expect(output).toEqual([
        'OUT ℹ  Typecheck started…',
        'OUT ✔  Typecheck passed',
        'OUT ℹ  Typecheck finished in TIME',
        'OUT ℹ  Typecheck started…',
        "ERR src/index.ts(8,19): error TS2552: Cannot find name 'URL'. Did you mean 'url'?",
        "ERR src/index.ts(13,25): error TS2304: Cannot find name 'sourcePath'.",
        'ERR ✖  Typecheck failed with 2 errors',
        'ERR ℹ  Typecheck finished in TIME',
        'OUT ℹ  Typecheck started…',
        'OUT ✔  Typecheck passed',
        'OUT ℹ  Typecheck finished in TIME',
        'OUT ℹ  Typecheck started…',
        "ERR src/index.ts(8,19): error TS2552: Cannot find name 'URL'. Did you mean 'url'?",
        "ERR src/index.ts(13,25): error TS2304: Cannot find name 'sourcePath'.",
        'ERR ✖  Typecheck failed with 2 errors',
        'ERR ℹ  Typecheck finished in TIME',
      ]);
    });
  });

  describe('build, once', () => {
    const build = setup(
      path.join(__dirname, 'fixture', 'build'),
      path.join(__dirname, 'fixture', 'build', 'run'),
    );

    beforeEach(build.init);
    afterEach(build.cleanup);

    it('produces no output by default', async () => {
      const { code, output } = await build.run('pkg-three/build.mjs', []);
      expect(code).toBe(0);
      expect(output).toEqual([
        'OUT ℹ  Typecheck started…',
        'OUT ✔  Typecheck passed',
        'OUT ℹ  Typecheck finished in TIME',
      ]);

      await expect(build.findTSOutput()).resolves.toEqual([]);
    });

    it('reports errors across all dependencies', async () => {
      const { code, output } = await build.run('pkg-three/build.mjs', [
        ['pkg-one/one-error.ts', 'pkg-one/one.ts'],
        ['pkg-two/two-error.ts', 'pkg-two/two.ts'],
      ]);

      expect(code).toBe(1);
      expect(output).toEqual([
        'OUT ℹ  Typecheck started…',
        "ERR ../pkg-one/one.ts(7,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        "ERR ../pkg-two/two.ts(8,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        'ERR ✖  Typecheck failed with 2 errors',
        'ERR ℹ  Typecheck finished in TIME',
      ]);

      await expect(build.findTSOutput()).resolves.toEqual([]);
    });

    it('reports errors in entry point', async () => {
      const { code, output } = await build.run('pkg-three/build.mjs', [
        ['pkg-three/three-error.ts', 'pkg-three/three.ts'],
      ]);

      expect(code).toBe(1);
      expect(output).toEqual([
        'OUT ℹ  Typecheck started…',
        "ERR three.ts(13,7): error TS2322: Type 'boolean | undefined' is not assignable to type 'boolean'.",
        "ERR   Type 'undefined' is not assignable to type 'boolean'.",
        "ERR three.ts(18,7): error TS2322: Type 'boolean | undefined' is not assignable to type 'boolean'.",
        'ERR ✖  Typecheck failed with 2 errors',
        'ERR ℹ  Typecheck finished in TIME',
      ]);

      await expect(build.findTSOutput()).resolves.toEqual([]);
    });

    it('writes output when buildMode is write-output', async () => {
      const { code, output } = await build.run('pkg-three/build.mjs', [], {
        buildMode: 'write-output',
      });

      expect(code).toBe(0);
      expect(output).toEqual([
        'OUT ℹ  Typecheck started…',
        'OUT ✔  Typecheck passed',
        'OUT ℹ  Typecheck finished in TIME',
      ]);

      await expect(build.findTSOutput()).resolves.toEqual([
        'pkg-one/build/one.js',
        'pkg-one/build/tsconfig.tsbuildinfo',
        'pkg-one/types/one.d.ts',
        'pkg-three/build/three.js',
        'pkg-three/build/tsconfig.tsbuildinfo',
        'pkg-three/types/three.d.ts',
        'pkg-two/build/tsconfig.tsbuildinfo',
        'pkg-two/build/two.js',
        'pkg-two/types/two.d.ts',
      ]);
    });
  });

  describe('build, watch', () => {
    const build = setup(
      path.join(__dirname, 'fixture', 'build'),
      path.join(__dirname, 'fixture', 'build', 'watch'),
    );

    beforeEach(build.init);
    afterEach(build.cleanup);

    it('produces no output by default', async () => {
      const { output } = await build.run('pkg-three/build.mjs', [], { watch: true });
      expect(output).toEqual([
        'OUT ℹ  Typecheck started…',
        'OUT ✔  Typecheck passed',
        'OUT ℹ  Typecheck finished in TIME',
      ]);

      await expect(build.findTSOutput()).resolves.toEqual([]);
    });

    it('reports errors across all dependencies', async () => {
      const { output } = await build.run(
        'pkg-three/build.mjs',
        [
          ['pkg-one/one-error.ts', 'pkg-one/one.ts'],
          ['pkg-two/two-error.ts', 'pkg-two/two.ts'],
          ['pkg-three/three-error.ts', 'pkg-three/three.ts'],
          ['pkg-one/one.ts', 'pkg-one/one.ts'],
          ['pkg-two/two.ts', 'pkg-two/two.ts'],
          ['pkg-three/three.ts', 'pkg-three/three.ts'],
        ],
        { watch: true },
      );

      expect(output).toEqual([
        'OUT ℹ  Typecheck started…',
        'OUT ✔  Typecheck passed',
        'OUT ℹ  Typecheck finished in TIME',
        'OUT ℹ  Typecheck started…',
        "ERR ../pkg-one/one.ts(7,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        'ERR ✖  Typecheck failed with 1 error',
        'ERR ℹ  Typecheck finished in TIME',
        'OUT ℹ  Typecheck started…',
        "ERR ../pkg-two/two.ts(8,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        "ERR ../pkg-one/one.ts(7,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        'ERR ✖  Typecheck failed with 2 errors',
        'ERR ℹ  Typecheck finished in TIME',
        'OUT ℹ  Typecheck started…',
        "ERR ../pkg-one/one.ts(7,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        "ERR ../pkg-two/two.ts(8,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        'ERR ✖  Typecheck failed with 2 errors',
        'ERR ℹ  Typecheck finished in TIME',
        'OUT ℹ  Typecheck started…',
        "ERR ../pkg-two/two.ts(8,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        'ERR ✖  Typecheck failed with 1 error',
        'ERR ℹ  Typecheck finished in TIME',
        'OUT ℹ  Typecheck started…',
        "ERR three.ts(13,7): error TS2322: Type 'boolean | undefined' is not assignable to type 'boolean'.",
        "ERR   Type 'undefined' is not assignable to type 'boolean'.",
        "ERR three.ts(18,7): error TS2322: Type 'boolean | undefined' is not assignable to type 'boolean'.",
        'ERR ✖  Typecheck failed with 2 errors',
        'ERR ℹ  Typecheck finished in TIME',
        'OUT ℹ  Typecheck started…',
        'OUT ✔  Typecheck passed',
        'OUT ℹ  Typecheck finished in TIME',
      ]);

      await expect(build.findTSOutput()).resolves.toEqual([]);
    }, 20000);

    it('writes output when buildMode is write-output', async () => {
      const { output } = await build.run('pkg-three/build.mjs', [], {
        buildMode: 'write-output',
        watch: true,
      });

      expect(output).toEqual([
        'OUT ℹ  Typecheck started…',
        'OUT ✔  Typecheck passed',
        'OUT ℹ  Typecheck finished in TIME',
      ]);

      await expect(build.findTSOutput()).resolves.toEqual([
        'pkg-one/build/one.js',
        'pkg-one/build/tsconfig.tsbuildinfo',
        'pkg-one/types/one.d.ts',
        'pkg-three/build/three.js',
        'pkg-three/build/tsconfig.tsbuildinfo',
        'pkg-three/types/three.d.ts',
        'pkg-two/build/tsconfig.tsbuildinfo',
        'pkg-two/build/two.js',
        'pkg-two/types/two.d.ts',
      ]);
    });
  });
});
