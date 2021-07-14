import fs from 'fs';
import path from 'path';

export async function* moonWalk(dirPath: string): AsyncGenerator<string> {
  const entries = (await fs.promises.readdir(dirPath, { withFileTypes: true })).reverse();
  for (const d of entries) {
    const entry = path.join(dirPath, d.name);
    if (d.isDirectory()) yield* moonWalk(entry);
    else if (d.isFile()) yield entry;
  }
}
