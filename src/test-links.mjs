import fs from 'node:fs';
import path from 'node:path';
import { readPlaywright } from './playwright.mjs';

export const READERS = { playwright: readPlaywright };
const NODE_TAG = /^(screen|call):(.+)$/;

function resultFiles(p) {
  if (!fs.statSync(p).isDirectory()) return [p];
  return fs
    .readdirSync(p, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

export function linkTests(config, map) {
  const known = new Set(map.screens.map((s) => `screen:${s.id}`));
  const nodes = {};
  const unknownTags = [];
  const untagged = new Set();
  const missingSources = [];
  const seenUnknown = new Set();

  for (const source of config.tests) {
    if (!fs.existsSync(source.path)) {
      missingSources.push(path.relative(config.configDir, source.path));
      continue;
    }
    for (const file of resultFiles(source.path)) {
      const tests = READERS[source.format](file);
      if (!tests) continue;
      for (const t of tests) {
        const testKey = `${t.file}:${t.line} ${t.title}`;
        const nodeTags = t.tags.filter((tag) => NODE_TAG.test(tag));
        if (nodeTags.length === 0) {
          untagged.add(testKey);
          continue;
        }
        const test = { title: t.title, file: t.file, line: t.line, project: t.project };
        const entry = { ...test, source: path.relative(config.configDir, file), format: source.format, depth: source.depth, status: t.status };
        for (const tag of nodeTags) {
          if (known.has(tag)) {
            (nodes[tag.match(NODE_TAG)[2]] ??= []).push(entry);
          } else if (!seenUnknown.has(`${tag} ${testKey}`)) {
            seenUnknown.add(`${tag} ${testKey}`);
            unknownTags.push({ tag, test: { title: t.title, file: t.file, line: t.line } });
          }
        }
      }
    }
  }

  return { meta: { generatedAt: new Date().toISOString() }, nodes, unknownTags, untaggedCount: untagged.size, missingSources };
}
