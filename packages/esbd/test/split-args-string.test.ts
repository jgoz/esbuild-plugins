import { describe, expect, test } from 'vitest';

import { splitArgsString } from '../lib/split-args-string';

describe('splitArgsString', () => {
  test('basic args', () => {
    const input = 'git clone http://github.com/evanlucas/node-launchctl.git';
    const out = splitArgsString(input);
    expect(out).toEqual(['git', 'clone', 'http://github.com/evanlucas/node-launchctl.git']);
  });

  test('args with double quotes - removes quotes', () => {
    const input = 'npm config set init.author.name "Evan Lucas" --verbose';
    const out = splitArgsString(input);
    expect(out).toEqual(['npm', 'config', 'set', 'init.author.name', 'Evan Lucas', '--verbose']);
  });

  test('args with single quotes - removes quotes', () => {
    const input = "npm config set init.author.name 'Evan Lucas' --verbose";
    const out = splitArgsString(input);
    expect(out).toEqual(['npm', 'config', 'set', 'init.author.name', 'Evan Lucas', '--verbose']);
  });

  test('args with nested quotes', () => {
    const input = 'npm config set init.author.name \'Evan "Hereford" Lucas\' --verbose';
    const out = splitArgsString(input);
    expect(out).toEqual([
      'npm',
      'config',
      'set',
      'init.author.name',
      'Evan "Hereford" Lucas',
      '--verbose',
    ]);
  });

  test('args with nested single quotes', () => {
    const input = 'npm config set init.author.name "Evan \'Hereford\' Lucas" --verbose';
    const out = splitArgsString(input);
    expect(out).toEqual([
      'npm',
      'config',
      'set',
      'init.author.name',
      "Evan 'Hereford' Lucas",
      '--verbose',
    ]);
  });

  test('blank string', () => {
    const input = '';
    const out = splitArgsString(input);
    expect(out).toEqual([]);
  });
});
