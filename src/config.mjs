import fs from 'node:fs';
import path from 'node:path';
import { DEPTHS, READERS } from './test-links.mjs';

const TEST_FORMATS = Object.keys(READERS);
const NAME = '[A-Za-z_$][\\w$]*';
const ROLE_NAME = new RegExp(`^${NAME}$`);
const ROLE_MEMBER = new RegExp(`^(${NAME})(?:\\[(?:'([^']*)'|"([^"]*)")\\]|\\.(${NAME}))$`);

export function parseRoleEntry(entry) {
  if (typeof entry === 'string' && ROLE_NAME.test(entry)) return { name: entry };
  const m = typeof entry === 'string' && entry.match(ROLE_MEMBER);
  if (m) return { object: m[1], key: m[2] ?? m[3] ?? m[4] };
  throw new Error(`roleIdentifiers entry ${JSON.stringify(entry)} is neither an identifier (memberRole) nor one member of an object (workspace['member.role'])`);
}

export function loadConfig(configPath) {
  const configDir = path.dirname(path.resolve(configPath));
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const at = (p) => path.resolve(configDir, p);
  const tests = (raw.tests ?? []).map((t) => {
    if (!TEST_FORMATS.includes(t.format)) throw new Error(`unknown test format "${t.format}" (expected one of ${TEST_FORMATS.join(', ')})`);
    if (!DEPTHS.includes(t.depth)) throw new Error(`unknown depth "${t.depth}" for ${t.path} (expected one of ${DEPTHS.join(', ')})`);
    return { ...t, path: at(t.path) };
  });
  (raw.roleIdentifiers ?? []).forEach(parseRoleEntry);
  const bodyArgKeys = raw.bodyArgKeys ?? [];
  if (!Array.isArray(bodyArgKeys) || !bodyArgKeys.every((k) => typeof k === 'string')) {
    throw new Error(`bodyArgKeys must be a list of property names, such as ["data"], not ${JSON.stringify(raw.bodyArgKeys)}`);
  }
  const bodyOptions = raw.bodyOptions ?? {};
  const isKeyList = (keys) => Array.isArray(keys) && keys.every((k) => typeof k === 'string');
  if (typeof bodyOptions !== 'object' || Array.isArray(bodyOptions) || !Object.values(bodyOptions).every(isKeyList)) {
    throw new Error(`bodyOptions must map call IDs to lists of body keys, such as {"POST:/api/v1/report/export": ["withHistory"]}, not ${JSON.stringify(raw.bodyOptions)}`);
  }
  const settingsDefaults = raw.settingsDefaults ?? {};
  for (const [root, entry] of Object.entries(settingsDefaults)) {
    if (!(raw.settingsRoots ?? []).includes(root)) throw new Error(`settingsDefaults root "${root}" is not listed in settingsRoots`);
    if (typeof entry?.file !== 'string' || typeof entry?.const !== 'string') throw new Error(`settingsDefaults.${root} needs "file" and "const"`);
  }
  const outDir = at(raw.outDir ?? '.');
  return {
    ...raw,
    configDir,
    srcRoot: at(raw.srcRoot),
    roleIdentifiers: raw.roleIdentifiers ?? [],
    bodyArgKeys,
    bodyOptions,
    settingsDefaults,
    redirectElements: raw.redirectElements ?? ['Redirect'],
    entryPaths: raw.entryPaths ?? [],
    serverEndpoints: [raw.serverEndpoints].flat().map(at),
    outDir,
    marksDir: raw.marksDir ? at(raw.marksDir) : path.join(outDir, 'marks'),
    tests,
  };
}
