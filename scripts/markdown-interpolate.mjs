#!/usr/bin/env node
/**
 * The MIT License (MIT)
 *
 * Copyright (c) Yuan Qing Lim
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the Software
 * is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
 * IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import execa from 'execa';
import fs from 'node:fs';
import { dirname } from 'path';

const interpolateRegex =
  /(<!-- ?(?:([^\n]*?) )?markdown-interpolate: ?([^\n]*?) ?-->\n)[\S\s]*?(<!-- ?(?:([^\n]*?) )?end ?-->)/g;

async function interpolateFile(file) {
  const directory = dirname(file);
  const string = await fs.promises.readFile(file, 'utf8');
  const matches = string.matchAll(interpolateRegex);
  if (matches === null) {
    return;
  }
  const result = [];
  let startIndex = 0;
  for (const match of matches) {
    if (typeof match.index === 'undefined') {
      throw new Error('Invariant violation');
    }
    result.push(string.slice(startIndex, match.index));
    result.push(match[1]);
    if (typeof match[2] !== 'undefined') {
      result.push(ensureTrailingNewline(renderSpecialCharacters(match[2])));
    }
    result.push(`${await executeCommand(match[3], directory)}\n`);
    if (typeof match[5] !== 'undefined') {
      result.push(ensureTrailingNewline(renderSpecialCharacters(match[5])));
    }
    result.push(match[4]);
    startIndex = match.index + match[0].length;
  }
  result.push(string.slice(startIndex));
  await fs.promises.writeFile(file, result.join(''));
}

async function executeCommand(command, cwd) {
  const { stdout } = await execa(command, { cwd, shell: true });
  return stdout;
}

function ensureTrailingNewline(string) {
  if (string[string.length - 1] === '\n') {
    return string;
  }
  return `${string}\n`;
}

function renderSpecialCharacters(string) {
  return string.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

interpolateFile(process.argv[2]);
