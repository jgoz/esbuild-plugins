/* eslint-env jest */
import fs from 'fs';
import { css_beautify, html_beautify, js_beautify } from 'js-beautify';
import path from 'path';
import { expect } from 'vitest';

const SEPARATOR = '---------------------------------';

function* walk(dirPath: string): Generator<string, void> {
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
        ? html_beautify(content, {
            indent_size: 2,
            indent_inner_html: true,
            extra_liners: [],
            preserve_newlines: false,
          })
        : file.endsWith('.js')
        ? js_beautify(content, { indent_size: 2 })
        : file.endsWith('.css')
        ? css_beautify(content, { indent_size: 2 })
        : content;

      output.push(formatted);
    }

    return output.join('\n');
  },
});
