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

async function buildCopy(edit) {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'duru-test-'));
  try {
    fs.cpSync(FIXTURE, copy, { recursive: true });
    const rewrite = (rel, fn) => fs.writeFileSync(path.join(copy, rel), fn(fs.readFileSync(path.join(copy, rel), 'utf8')));
    edit(rewrite);
    return await buildFixture(copy);
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
}

test('each API call becomes a node named by its method and the server path, or the client URL when the server lacks it', async () => {
  const map = await buildFixture();
  assert.deepEqual(
    map.calls.map((c) => [c.id, c.server.status, (c.server.labels ?? []).join(','), c.apiFunctions.join(','), c.screens.join(',')]),
    [
      ['GET:/api/v1/document/list', 'match', 'core', 'ajaxDocumentList', '/home#Home'],
      ['GET:/api/v1/document/{documentId}', 'match', 'core', 'ajaxDocumentDetail', '/document/:id#DocumentDetail'],
      ['GET:/api/v1/lab/experiment', 'match', 'profile-lab', 'ajaxLabExperiment', '/lab#Lab'],
      ['GET:/api/v1/member/list', 'match', 'core', 'ajaxMemberList', '/admin/member#AdminMember'],
      ['POST:/api/v1/archive/document', 'none', '', 'ajaxDocumentArchive', '/document/:tab_draft_done_#DocumentList,/home#Home'],
      ['POST:/api/v1/auth/sign-in', 'match', 'core', 'ajaxSignIn', '/signin#SignIn'],
      ['PUT:/api/v1/document/{documentId}/name', 'method-mismatch', '', 'ajaxDocumentRename', '/document/:id#DocumentDetail'],
    ],
  );
  const rename = map.calls.find((c) => c.id === 'PUT:/api/v1/document/{documentId}/name');
  assert.deepEqual(rename.server.candidates, ['core POST /api/v1/document/{documentId}/name']);
  assert.equal(rename.method, 'PUT');
  assert.equal(rename.path, '/api/v1/document/{documentId}/name');
});

test('a call is listed once per API function, and each endpoint on a screen points at its call node', async () => {
  const map = await buildFixture();
  assert.deepEqual(
    Object.entries(map.apiFunctions).map(([name, fn]) => `${name} ${fn.endpoints.map((e) => e.callId).join(' ')}`),
    [
      'ajaxSignIn POST:/api/v1/auth/sign-in',
      'ajaxDocumentList GET:/api/v1/document/list',
      'ajaxDocumentDetail GET:/api/v1/document/{documentId}',
      'ajaxDocumentRename PUT:/api/v1/document/{documentId}/name',
      'ajaxDocumentArchive POST:/api/v1/archive/document',
      'ajaxDownload ',
      'ajaxMemberList GET:/api/v1/member/list',
      'ajaxLabExperiment GET:/api/v1/lab/experiment',
    ],
  );
  const detail = screen(map, '/document/:id#DocumentDetail').apiCalls.flatMap((c) => c.endpoints.map((e) => e.callId));
  assert.deepEqual(detail, ['GET:/api/v1/document/{documentId}', 'PUT:/api/v1/document/{documentId}/name']);
});

test('a screen that reaches a call missing on the server is dead; a call whose URL cannot be computed makes no node and no dead screen', async () => {
  const map = await buildFixture();
  assert.deepEqual(map.screens.filter((s) => s.dead).map((s) => s.id), ['/home#Home', '/document/:tab_draft_done_#DocumentList']);

  const download = map.apiFunctions.ajaxDownload.endpoints;
  assert.deepEqual(download.map((e) => [e.server.status, e.callId]), [['unresolved', null]]);
  assert.equal(map.calls.some((c) => c.apiFunctions.includes('ajaxDownload')), false);

  const withoutTable = await buildCopy((rewrite) =>
    rewrite('client/src/components/DocumentList.js', (src) => src.replace("import DocumentTable from './DocumentTable';\n", '').replace('      <DocumentTable />\n', '')),
  );
  const list = screen(withoutTable, '/document/:tab_draft_done_#DocumentList');
  assert.deepEqual(list.apiCalls.map((c) => c.fn), ['ajaxDownload']);
  assert.equal(list.dead, false);
});

test('when several server paths fit a call, the ID takes the closest one, then the first in sorted order', async () => {
  const map = await buildCopy((rewrite) => rewrite('server-endpoints-lab.txt', (src) => `${src}profile-lab\tGET\t/api/v1/document/{docId}\n`));
  const detail = map.calls.find((c) => c.apiFunctions.includes('ajaxDocumentDetail'));
  assert.equal(detail.id, 'GET:/api/v1/document/{docId}');
  assert.deepEqual(detail.server.labels, ['core', 'profile-lab']);
  assert.equal(map.calls.find((c) => c.apiFunctions.includes('ajaxDocumentList')).id, 'GET:/api/v1/document/list');
});

test('a call node carries only the labels that serve its own path, whatever order the API functions come in', async () => {
  const moveListToLab = (rewrite) => {
    rewrite('server-endpoints.txt', (src) => src.replace('core\tGET\t/api/v1/document/list\n', ''));
    rewrite('server-endpoints-lab.txt', (src) => `${src}profile-lab\tGET\t/api/v1/document/list\n`);
  };
  const recent = "export const ajaxDocumentRecent = async () => Ajax.request({ info: { METHOD: 'GET', URL: '/api/v1/document/recent' } });\n";
  const labelsById = (map) => Object.fromEntries(map.calls.map((c) => [c.id, c.server.labels ?? c.server.candidates ?? []]));
  const after = await buildCopy((rewrite) => {
    moveListToLab(rewrite);
    rewrite('client/src/_ajax/AjaxFunc.js', (src) => src + recent);
  });
  const before = await buildCopy((rewrite) => {
    moveListToLab(rewrite);
    rewrite('client/src/_ajax/AjaxFunc.js', (src) => src.replace('export const ajaxSignIn', `${recent}export const ajaxSignIn`));
  });
  assert.deepEqual(labelsById(after)['GET:/api/v1/document/list'], ['profile-lab']);
  assert.deepEqual(labelsById(after)['GET:/api/v1/document/{documentId}'], ['core']);
  assert.deepEqual(labelsById(before), labelsById(after));
});

test('screen and call IDs contain no character a JUnit tag rejects', async () => {
  const map = await buildFixture();
  for (const s of map.screens) assert.doesNotMatch(s.id, /[\s,()&|!]/, s.id);
  for (const c of map.calls) assert.doesNotMatch(c.id, /[\s,()&|!]/, c.id);
  assert.deepEqual(map.duplicateIds, []);

  const odd = await buildCopy((rewrite) => rewrite('client/src/_define/Option.js', (src) => src.replace("'archive/document'", "'archive/document (all)'")));
  const archive = odd.calls.find((c) => c.apiFunctions.includes('ajaxDocumentArchive'));
  assert.equal(archive.id, 'POST:/api/v1/archive/document_all_');
  assert.equal(archive.path, '/api/v1/archive/document (all)');
});

test('two builds from the same input differ only in the generation time', async () => {
  const strip = (map) => ({ ...map, meta: { ...map.meta, generatedAt: null } });
  assert.deepEqual(strip(await buildFixture()), strip(await buildFixture()));
});

test('screen and call IDs stay the same after unrelated files change', async () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'duru-test-'));
  try {
    fs.cpSync(FIXTURE, copy, { recursive: true });
    const src = path.join(copy, 'client/src');
    const prepend = (rel, text) => fs.writeFileSync(path.join(src, rel), text + fs.readFileSync(path.join(src, rel), 'utf8'));
    prepend('Routes.js', '// moved\n\n\n');
    prepend('components/Help.js', "import { useState } from 'react';\n\n");
    prepend('_ajax/AjaxFunc.js', '// moved\n');
    fs.writeFileSync(path.join(src, 'components/Unused.js'), 'export default function Unused() { return null; }\n');
    const endpoints = path.join(copy, 'server-endpoints.txt');
    fs.writeFileSync(endpoints, fs.readFileSync(endpoints, 'utf8').trim().split('\n').reverse().join('\n') + '\n');

    const original = await buildFixture();
    const after = await buildFixture(copy);
    assert.deepEqual(after.screens.map((s) => s.id), original.screens.map((s) => s.id));
    assert.notEqual(after.screens[0].line, original.screens[0].line);
    assert.deepEqual(after.calls.map((c) => c.id), original.calls.map((c) => c.id));
    assert.notEqual(after.apiFunctions.ajaxSignIn.endpoints[0].line, original.apiFunctions.ajaxSignIn.endpoints[0].line);
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
