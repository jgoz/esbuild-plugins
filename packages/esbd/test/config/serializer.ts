/* eslint-env jest */
const fs = require('fs');
const path = require('path');
const prettier = require('prettier');

const SEPARATOR = '---------------------------------';

function* walk(dirPath: string) {
  for (const d of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entry = path.join(dirPath, d.name);
    if (d.isDirectory()) yield* walk(entry);
    else if (d.isFile()) yield entry;
  }
}

export interface BuildWithHTMLOutput {
  cwd: string;
  outdir: string;
  stdout: string;
  stderr: string;
}

expect.addSnapshotSerializer({
  test: value => typeof value === 'object' && !!value && 'outdir' in value,
  serialize: val => {
    const value: BuildWithHTMLOutput = val;
    const output: string[] = [];

    if (value.stdout) {
      output.push(SEPARATOR);
      output.push('STDOUT');
      output.push(SEPARATOR);
      output.push(value.stdout.replace(/in .+$/, 'in XX time'));
    }

    if (value.stderr) {
      output.push(SEPARATOR);
      output.push('STDOUT');
      output.push(SEPARATOR);
      output.push(value.stderr);
    }

    for (const file of walk(value.outdir)) {
      output.push(SEPARATOR);
      output.push(path.relative(value.outdir, file));
      output.push(SEPARATOR);
      const content = fs.readFileSync(file, 'utf-8').replaceAll(value.cwd, '<CWD>');

      const formatted = file.endsWith('.html')
        ? prettier.format(content, { parser: 'html' })
        : file.endsWith('.js')
        ? prettier.format(content, { parser: 'babel' })
        : file.endsWith('.css')
        ? prettier.format(content, { parser: 'css' })
        : content;

      output.push(formatted);
    }

    return output.join('\n');
  },
});
