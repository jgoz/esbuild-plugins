/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-env node,jest */

const fs = jest.requireActual('fs');
const { Volume, createFsFromVolume } = require('memfs');
const path = require('path');

function createFS() {
  function* walk(dirPath) {
    const dir = fs.opendirSync(dirPath);
    let ent;
    while ((ent = dir.readSync())) {
      const entry = path.join(dirPath, ent.name);
      if (ent.isDirectory()) yield* walk(entry);
      else if (ent.isFile()) yield entry;
    }
    dir.closeSync();
  }

  const directoryJSON = {};
  for (const entry of walk(path.join(__dirname, '..', 'fixture'))) {
    directoryJSON[entry] = fs.readFileSync(entry, 'utf-8');
  }

  const vol = Volume.fromJSON(directoryJSON);
  return createFsFromVolume(vol);
}

module.exports = createFS();
