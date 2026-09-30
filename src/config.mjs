import fs from 'node:fs';
import path from 'node:path';
import { DEPTHS, READERS } from './test-links.mjs';

const TEST_FORMATS = Object.keys(READERS);

export function loadConfig(configPath) {
  const configDir = path.dirname(path.resolve(configPath));
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const at = (p) => path.resolve(configDir, p);
  const tests = (raw.tests ?? []).map((t) => {
    if (!TEST_FORMATS.includes(t.format)) throw new Error(`unknown test format "${t.format}" (expected one of ${TEST_FORMATS.join(', ')})`);
    if (!DEPTHS.includes(t.depth)) throw new Error(`unknown depth "${t.depth}" for ${t.path} (expected one of ${DEPTHS.join(', ')})`);
    return { ...t, path: at(t.path) };
  });
  return {
    ...raw,
    configDir,
    srcRoot: at(raw.srcRoot),
    roleIdentifiers: raw.roleIdentifiers ?? [],
    redirectElements: raw.redirectElements ?? ['Redirect'],
    entryPaths: raw.entryPaths ?? [],
    serverEndpoints: [raw.serverEndpoints].flat().map(at),
    outDir: at(raw.outDir ?? '.'),
    tests,
  };
}
