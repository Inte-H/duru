import fs from 'node:fs';
import path from 'node:path';
import { readJunit } from './junit.mjs';
import { readPlaywright } from './playwright.mjs';
import { readVerdicts } from './verdict.mjs';
import { readVitest } from './vitest.mjs';

export const READERS = {
  playwright: { read: readPlaywright, extensions: ['.json'] },
  junit: { read: readJunit, extensions: ['.xml'] },
  vitest: { read: readVitest, extensions: ['.json'] },
  verdict: { read: readVerdicts, extensions: ['.txt', '.log'] },
};
export const DEPTHS = ['ui', 'api', 'render', 'code', 'data'];
const NODE_TAG = /^(screen|call):(.+)$/;
const DEPTH_TAG = /^depth:(.*)$/;

function resultFiles(p, extensions) {
  if (!fs.statSync(p).isDirectory()) return [p];
  return fs
    .readdirSync(p, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && extensions.some((ext) => e.name.endsWith(ext)))
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
  const reportUnknown = (tag, t, testKey) => {
    if (seenUnknown.has(`${tag} ${testKey}`)) return;
    seenUnknown.add(`${tag} ${testKey}`);
    unknownTags.push({ tag, test: { title: t.title, file: t.file, line: t.line } });
  };

  for (const source of config.tests) {
    if (!fs.existsSync(source.path)) {
      missingSources.push(path.relative(config.configDir, source.path));
      continue;
    }
    for (const file of resultFiles(source.path, READERS[source.format].extensions)) {
      const tests = READERS[source.format].read(file);
      if (!tests) continue;
      const resultPath = path.relative(config.configDir, file);
      for (const t of tests) {
        const testKey = `${resultPath} ${t.file}:${t.line} ${t.title}`;
        let depth = source.depth;
        for (const tag of t.tags) {
          const value = tag.match(DEPTH_TAG)?.[1];
          if (value === undefined) continue;
          if (DEPTHS.includes(value)) depth = value;
          else reportUnknown(tag, t, testKey);
        }
        const nodeTags = t.tags.filter((tag) => NODE_TAG.test(tag));
        if (nodeTags.length === 0) {
          untagged.add(testKey);
          continue;
        }
        const test = { title: t.title, file: t.file, line: t.line, project: t.project };
        const entry = { ...test, source: resultPath, format: source.format, depth, status: t.status, ...(t.detail && { detail: t.detail }) };
        for (const tag of nodeTags) {
          if (known.has(tag)) {
            (nodes[tag.match(NODE_TAG)[2]] ??= []).push(entry);
          } else {
            reportUnknown(tag, t, testKey);
          }
        }
      }
    }
  }

  return { meta: { generatedAt: new Date().toISOString() }, nodes, unknownTags, untaggedCount: untagged.size, missingSources };
}
