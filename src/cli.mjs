#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { buildMap } from './map.mjs';
import { gitUserName, startReviewServer } from './review.mjs';
import { linkTests } from './test-links.mjs';

const COMMANDS = ['extract', 'rebuild', 'review'];
const DEFAULT_PORT = 4400;
const [, , command, configPath, ...extra] = process.argv;
const portArg = command === 'review' && extra[0] === '--port' && extra.length === 2 ? Number(extra[1]) : null;
if (!COMMANDS.includes(command) || !configPath || (extra.length > 0 && !Number.isInteger(portArg))) {
  console.error(`usage: duru <extract|rebuild> <config.json>\n       duru review <config.json> [--port <n>]`);
  process.exit(2);
}

const config = loadConfig(configPath);

if (command === 'review') {
  const author = gitUserName(config.configDir);
  const server = await startReviewServer(config, { port: portArg ?? DEFAULT_PORT, author });
  console.log(`review page http://127.0.0.1:${server.address().port}/`);
  console.log(`marks ${config.marksDir} | author ${author ?? '(git user.name not set — the page asks for a name)'}`);
} else {
  fs.mkdirSync(config.outDir, { recursive: true });
  const write = (name, data) => {
    const file = path.join(config.outDir, name);
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
    return file;
  };

  const map = await buildMap(config);
  console.log(`wrote ${write('map.json', map)}`);
  const allEndpoints = Object.values(map.apiFunctions).flatMap((f) => f.endpoints);
  const count = (st) => allEndpoints.filter((e) => e.server.status === st).length;
  console.log(`screens ${map.screens.length} | api functions ${Object.keys(map.apiFunctions).length} | endpoints match ${count('match')} method-mismatch ${count('method-mismatch')} none ${count('none')} unresolved ${count('unresolved')}`);
  console.log(`dead calls reachable from screens: ${map.deadCalls.length}`);
  console.log(`calls ${map.calls.length} | dead screens ${map.screens.filter((s) => s.dead).length}`);
  console.log(`entry screens ${map.entries.length} | screens opening only under a setting or role ${map.screens.filter((s) => s.access.restricted).length}`);
  for (const p of map.unknownEntryPaths) console.log(`  entryPaths ${p} matches no route`);
  for (const d of map.duplicateIds) console.log(`  duplicate screen ID ${d.id} ← ${d.lines.map((l) => `${config.routesFile}:${l}`).join(', ')}`);

  if (command === 'rebuild') {
    const links = linkTests(config, map);
    console.log(`wrote ${write('tests.json', links)}`);
    const covered = map.screens.filter((s) => links.nodes[s.id]).length;
    console.log(`screens with tests ${covered}/${map.screens.length} | tags pointing outside the map ${links.unknownTags.length} | tests without a node tag ${links.untaggedCount}`);
    console.log(`calls with tests ${map.calls.filter((c) => links.nodes[c.id]).length}/${map.calls.length}`);
    for (const m of links.missingSources) console.log(`  missing test results ${m}`);
    for (const u of links.unknownTags) console.log(`  unknown ${u.tag} ← ${u.test.file}:${u.test.line} ${u.test.title}`);
  }
}
