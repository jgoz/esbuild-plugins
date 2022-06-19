import { node } from 'execa';
import fs from 'fs';
import os from 'os';
import path from 'path';

const xit = process.env.CI ? it.skip : it;

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

function setup(relFixtureDirSrc: string) {
  const fixtureDirSrc = path.join(__dirname, relFixtureDirSrc);
  const fixtureDirOut = fs.mkdtempSync(path.join(__dirname, 'tmp-'));

  async function copySrcFile(src: string, out: string) {
    await fs.promises.copyFile(path.join(fixtureDirSrc, src), path.join(fixtureDirOut, out));
  }

  function copySrcFileSync(src: string, out: string) {
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
      await Promise.all(queue.map(files => copySrcFile(...files)));
    }

    const scriptPath = path.join(fixtureDirOut, script);
    const proc = node(scriptPath, {
      all: true,
      encoding: 'utf8',
      reject: false,
      cwd: path.dirname(scriptPath),
      env: {
        ...process.env,
        NO_COLOR: '1',
        BUILD_MODE: buildMode,
        WATCH: watch ? 'true' : undefined,
      },
    });

    if (watch) {
      proc.all!.on('data', (chunk: Buffer) => {
        const str = chunk.toString();
        if (/Typecheck finished in/.exec(str)) {
          const files = queue.shift();
          if (files) {
            setTimeout(() => copySrcFileSync(...files), 300);
          } else {
            proc.cancel();
          }
        }
      });
    }

    const { exitCode, all = '' } = await proc;

    const output = all
      .split(os.EOL)
      .map(line => line.trimEnd())
      .filter(Boolean)
      .filter(l => !l.includes('Typecheck started'))
      .map(l => l.replace(/Typecheck finished in (\d+ms)/, 'Typecheck finished in TIME'));

    return { code: exitCode, output };
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

  return { cleanup, init, run, findTSOutput };
}

describe('eslint-plugin-typecheck', () => {
  describe('compile, once', () => {
    const build = setup('fixture/compile');

    beforeEach(async () => await build.init());
    afterEach(async () => await build.cleanup());

    it('completes successfully', async () => {
      const { code, output } = await build.run('build.js', [['src/index.ts', 'src/index.ts']]);
      expect(code).toBe(0);
      expect(output).toEqual(['✔  Typecheck passed', 'ℹ  Typecheck finished in TIME']);
    });

    it('reports errors', async () => {
      const { code, output } = await build.run('build.js', [
        ['src/index-error.ts', 'src/index.ts'],
      ]);
      expect(code).toBe(1);
      expect(output).toEqual([
        "src/index.ts(13,25): error TS2304: Cannot find name 'sourcePath'.",
        '✖  Typecheck failed with 1 error',
        'ℹ  Typecheck finished in TIME',
      ]);
    });
  });

  describe('compile, watch', () => {
    const build = setup('fixture/compile');

    beforeEach(async () => await build.init());
    afterEach(async () => await build.cleanup());

    it('watches for changes', async () => {
      const { output } = await build.run(
        'build.js',
        [
          ['src/index-error.ts', 'src/index.ts'],
          ['src/index.ts', 'src/index.ts'],
          ['src/index-error.ts', 'src/index.ts'],
        ],
        { watch: true },
      );

      expect(output).toEqual([
        '✔  Typecheck passed',
        'ℹ  Typecheck finished in TIME',
        "src/index.ts(13,25): error TS2304: Cannot find name 'sourcePath'.",
        '✖  Typecheck failed with 1 error',
        'ℹ  Typecheck finished in TIME',
        '✔  Typecheck passed',
        'ℹ  Typecheck finished in TIME',
        "src/index.ts(13,25): error TS2304: Cannot find name 'sourcePath'.",
        '✖  Typecheck failed with 1 error',
        'ℹ  Typecheck finished in TIME',
      ]);
    });
  });

  describe('build, once', () => {
    const build = setup('fixture/build');

    beforeEach(async () => await build.init());
    afterEach(async () => await build.cleanup());

    it('produces no output by default', async () => {
      const { code, output } = await build.run('pkg-three/build.js', []);
      expect(code).toBe(0);
      expect(output).toEqual(['✔  Typecheck passed', 'ℹ  Typecheck finished in TIME']);

      await expect(build.findTSOutput()).resolves.toEqual([]);
    });

    it('reports errors across all dependencies', async () => {
      const { code, output } = await build.run('pkg-three/build.js', [
        ['pkg-one/one-error.ts', 'pkg-one/one.ts'],
        ['pkg-two/two-error.ts', 'pkg-two/two.ts'],
      ]);

      expect(code).toBe(1);
      expect(output).toEqual([
        "../pkg-one/one.ts(7,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        "../pkg-two/two.ts(8,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        '✖  Typecheck failed with 2 errors',
        'ℹ  Typecheck finished in TIME',
      ]);

      await expect(build.findTSOutput()).resolves.toEqual([]);
    });

    it('reports errors in entry point', async () => {
      const { code, output } = await build.run('pkg-three/build.js', [
        ['pkg-three/three-error.ts', 'pkg-three/three.ts'],
      ]);

      expect(code).toBe(1);
      expect(output).toEqual([
        "three.ts(13,7): error TS2322: Type 'boolean | undefined' is not assignable to type 'boolean'.",
        "  Type 'undefined' is not assignable to type 'boolean'.",
        "three.ts(18,7): error TS2322: Type 'boolean | undefined' is not assignable to type 'boolean'.",
        '✖  Typecheck failed with 2 errors',
        'ℹ  Typecheck finished in TIME',
      ]);

      await expect(build.findTSOutput()).resolves.toEqual([]);
    });

    it('writes output when buildMode is write-output', async () => {
      const { code, output } = await build.run('pkg-three/build.js', [], {
        buildMode: 'write-output',
      });

      expect(code).toBe(0);
      expect(output).toEqual(['✔  Typecheck passed', 'ℹ  Typecheck finished in TIME']);

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
    const build = setup('fixture/build');

    beforeEach(async () => await build.init());
    afterEach(async () => await build.cleanup());

    it('produces no output by default', async () => {
      const { output } = await build.run('pkg-three/build.js', [], { watch: true });
      expect(output).toEqual(['✔  Typecheck passed', 'ℹ  Typecheck finished in TIME']);

      await expect(build.findTSOutput()).resolves.toEqual([]);
    });

    xit('reports errors across all dependencies [skip CI]', async () => {
      const { output } = await build.run(
        'pkg-three/build.js',
        [
          ['pkg-one/one-error.ts', 'pkg-one/one.ts'],
          ['pkg-two/two-error.ts', 'pkg-two/two.ts'],
          ['pkg-one/one.ts', 'pkg-one/one.ts'],
          ['pkg-two/two.ts', 'pkg-two/two.ts'],
        ],
        { buildMode: 'write-output', watch: true },
      );

      expect(output).toEqual([
        '✔  Typecheck passed',
        'ℹ  Typecheck finished in TIME',
        // one-error
        "../pkg-one/one.ts(7,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        '✖  Typecheck failed with 1 error',
        'ℹ  Typecheck finished in TIME',
        // two-error
        "../pkg-two/two.ts(8,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        "../pkg-one/one.ts(7,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        '✖  Typecheck failed with 2 errors',
        'ℹ  Typecheck finished in TIME',
        // one
        "../pkg-two/two.ts(8,33): error TS2504: Type 'AsyncIterator<string, any, undefined>' must have a '[Symbol.asyncIterator]()' method that returns an async iterator.",
        '✖  Typecheck failed with 1 error',
        'ℹ  Typecheck finished in TIME',
        // two
        '✔  Typecheck passed',
        'ℹ  Typecheck finished in TIME',
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
    }, 20000);

    it('writes output when buildMode is write-output', async () => {
      const { output } = await build.run('pkg-three/build.js', [], {
        buildMode: 'write-output',
        watch: true,
      });

      expect(output).toEqual(['✔  Typecheck passed', 'ℹ  Typecheck finished in TIME']);

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
