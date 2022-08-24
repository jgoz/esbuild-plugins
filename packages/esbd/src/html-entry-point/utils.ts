import { createHash } from 'crypto';
import { createReadStream, promises as fsp } from 'fs';

import type { HashAlgorithm } from './types';

export function cachedCopyFile(
  copyFile: typeof fsp.copyFile,
): (input: string, output: string) => Promise<void> {
  const modified = new Map<string, number>();
  return async (input, output) => {
    const stat = await fsp.stat(input);
    if (modified.get(input) === stat.mtimeMs) return;
    modified.set(input, stat.mtimeMs);
    await copyFile(input, output);
  };
}

export function calculateContentIntegrityHash(
  content: Uint8Array,
  integrity: HashAlgorithm,
): string {
  const hash = createHash(integrity);
  hash.update(content);

  return `${integrity}-${hash.digest('base64')}`;
}

export async function calculateFileIntegrityHash(
  filePath: string,
  integrity: HashAlgorithm,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(integrity);
    const stream = createReadStream(filePath);

    stream.on('data', d => hash.update(d));
    stream.on('end', () => {
      resolve(`${integrity}-${hash.digest('base64')}`);
    });
    stream.on('error', reject);
  });
}

export function collect<T>(values: (T | false | undefined | null)[]): T[] {
  return values.filter((v): v is T => !!v);
}
