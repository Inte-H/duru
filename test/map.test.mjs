import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { buildMap } from '../src/map.mjs';

const FIXTURE = path.join(import.meta.dirname, 'fixtures/app');
const buildFixture = (dir = FIXTURE) => buildMap(loadConfig(path.join(dir, 'config.json')));
const screen = (map, id) => map.screens.find((s) => s.id === id);

test('every route of the fake client becomes a screen, with the guard on its route', async () => {
  const map = await buildFixture();
  assert.deepEqual(
    map.screens.map((s) => s.id),
    ['/signin#SignIn', '/home#Home', '/document/:tab_draft_done_#DocumentList', '/document/:id#DocumentDetail', '/help#Help', '/admin/member#AdminMember', '/lab#Lab'],
  );
  assert.deepEqual(screen(map, '/admin/member#AdminMember').routeGuards, ['isAdminRole(memberRole)']);
  assert.deepEqual(screen(map, '/lab#Lab').routeGuards, ['globalSettings.SYSTEM.LAB_ENABLED']);
  assert.deepEqual(screen(map, '/home#Home').routeGuards, []);
});

test('links carry their own guard, and a handler used under a guard passes it to the link inside it', async () => {
  const map = await buildFixture();
  const homeLinks = screen(map, '/home#Home').links.map((l) => ({ to: l.to, guards: l.guards }));
  assert.deepEqual(homeLinks, [
    { to: '/admin/member', guards: ["memberRole === 'ADMIN'"] },
    { to: '/lab', guards: ['globalSettings.SYSTEM.LAB_ENABLED'] },
    { to: '/document', guards: [] },
  ]);

  const help = screen(map, '/signin#SignIn').links.find((l) => l.to === '/help');
  assert.deepEqual(help.guards, []);
  assert.deepEqual(
    help.inheritedGuards.map((g) => ({ via: g.via, guards: g.guards })),
    [{ via: 'openHelp', guards: ['globalSettings.SYSTEM.HELP_LINK_ENABLED'] }],
  );

  const rename = screen(map, '/document/:id#DocumentDetail').apiCalls.find((c) => c.fn === 'ajaxDocumentRename');
  assert.deepEqual(rename.inheritedGuards.map((g) => g.guards), [['canEdit']]);
});

test('each screen lists the settings read by the files it reaches', async () => {
  const map = await buildFixture();
  const keys = (id) => screen(map, id).settingReads.map((r) => `${r.file} ${r.key}`);
  assert.deepEqual(keys('/home#Home'), ['components/Home.js SYSTEM.LAB_ENABLED', 'components/DocumentTable.js DISPLAY.PAGE_SIZE']);
  assert.deepEqual(keys('/signin#SignIn'), ['components/SignIn.js SYSTEM.HELP_LINK_ENABLED']);
  assert.deepEqual(keys('/help#Help'), []);
});

test('screen IDs contain no character a JUnit tag rejects', async () => {
  const map = await buildFixture();
  for (const s of map.screens) assert.doesNotMatch(s.id, /[\s,()&|!]/, s.id);
  assert.deepEqual(map.duplicateIds, []);
});

test('two builds from the same input differ only in the generation time', async () => {
  const strip = (map) => ({ ...map, meta: { ...map.meta, generatedAt: null } });
  assert.deepEqual(strip(await buildFixture()), strip(await buildFixture()));
});

test('screen IDs stay the same after unrelated files change', async () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'duru-test-'));
  try {
    fs.cpSync(FIXTURE, copy, { recursive: true });
    const src = path.join(copy, 'client/src');
    const prepend = (rel, text) => fs.writeFileSync(path.join(src, rel), text + fs.readFileSync(path.join(src, rel), 'utf8'));
    prepend('Routes.js', '// moved\n\n\n');
    prepend('components/Help.js', "import { useState } from 'react';\n\n");
    fs.writeFileSync(path.join(src, 'components/Unused.js'), 'export default function Unused() { return null; }\n');

    const before = (await buildFixture()).screens.map((s) => s.id);
    const after = await buildFixture(copy);
    assert.deepEqual(after.screens.map((s) => s.id), before);
    assert.notEqual(after.screens[0].line, (await buildFixture()).screens[0].line);
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});

test('two routes that end up with the same screen ID are reported', async () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'duru-test-'));
  try {
    fs.cpSync(FIXTURE, copy, { recursive: true });
    const routes = path.join(copy, 'client/src/Routes.js');
    const src = fs.readFileSync(routes, 'utf8');
    fs.writeFileSync(routes, src.replace('    </Switch>', '      {memberRole && <Route path={Option.ROUTE_PATH.HELP} component={Help} />}\n    </Switch>'));
    const map = await buildFixture(copy);
    assert.deepEqual(map.duplicateIds, [{ id: '/help#Help', lines: [28, 31] }]);
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});
