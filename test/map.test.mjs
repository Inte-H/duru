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
    ['/signin#SignIn', '/home#Home', '/document/:tab_draft_done_#DocumentList', '/document/:id#DocumentDetail', '/help#Help', '/admin/member#AdminMember', '/admin/group#AdminGroup', '/lab#Lab', '/lab/result#LabResult', '/admin/audit#AdminAudit'],
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
    { to: '/admin/group', guards: ['isAdmin'] },
    { to: '/lab', guards: ['globalSettings.SYSTEM.LAB_ENABLED'] },
    { to: '/admin/audit', guards: ["session['member.role'] === 'AUDITOR'"] },
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
    assert.deepEqual(map.duplicateIds, [{ id: '/help#Help', lines: [33, 40] }]);
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});

async function buildEditedCopy(edits) {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'duru-test-'));
  try {
    fs.cpSync(FIXTURE, copy, { recursive: true });
    for (const [rel, from, to] of edits) {
      const file = path.join(copy, rel);
      const src = fs.readFileSync(file, 'utf8');
      assert.ok(src.includes(from), `${rel} has no ${from}`);
      fs.writeFileSync(file, src.replace(from, to));
    }
    return await buildFixture(copy);
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
}

const restrictedKinds = (map) => Object.fromEntries(map.screens.filter((s) => s.access.restricted).map((s) => [s.id, s.access.kinds]));

test('a screen opens only under a setting or a role when its route is guarded or every link into it is', async () => {
  const map = await buildFixture();
  assert.deepEqual(restrictedKinds(map), {
    '/help#Help': ['setting'],
    '/admin/member#AdminMember': ['role'],
    '/admin/group#AdminGroup': ['role'],
    '/lab#Lab': ['setting'],
    '/lab/result#LabResult': ['setting'],
    '/admin/audit#AdminAudit': ['role'],
  });
  const open = map.screens.filter((s) => !s.access.restricted);
  assert.deepEqual(open.map((s) => s.id), ['/signin#SignIn', '/home#Home', '/document/:tab_draft_done_#DocumentList', '/document/:id#DocumentDetail']);
  for (const s of open) assert.deepEqual([s.access.kinds, s.access.route], [[], []], s.id);
});

test('each restricted screen keeps the route guard and the links that decided it', async () => {
  const map = await buildFixture();
  assert.deepEqual(screen(map, '/admin/member#AdminMember').access, {
    restricted: true,
    kinds: ['role'],
    route: [{ guard: 'isAdminRole(memberRole)', kinds: ['role'] }],
    links: [{ from: '/home#Home', file: 'components/Home.js', line: 17, guards: [{ guard: "memberRole === 'ADMIN'", kinds: ['role'] }], fromRestricted: false }],
  });
  assert.deepEqual(screen(map, '/help#Help').access.links, [
    {
      from: '/document/:id#DocumentDetail',
      file: 'components/DocumentDetail.js',
      line: 20,
      guards: [{ guard: 'helpEnabled', kinds: ['setting'] }],
      fromRestricted: false,
    },
    {
      from: '/signin#SignIn',
      file: 'components/SignIn.js',
      line: 8,
      guards: [{ guard: 'globalSettings.SYSTEM.HELP_LINK_ENABLED', kinds: ['setting'], via: 'openHelp' }],
      fromRestricted: false,
    },
  ]);
  assert.deepEqual(screen(map, '/lab/result#LabResult').access, {
    restricted: true,
    kinds: ['setting'],
    route: [],
    links: [{ from: '/lab#Lab', file: 'components/Lab.js', line: 14, guards: [], fromRestricted: true }],
  });
});

test('a role check held in a local const hides the route and the link, and the screen opens only under a role', async () => {
  const map = await buildFixture();
  assert.deepEqual(screen(map, '/admin/group#AdminGroup').routeGuards, ['isAdmin']);
  assert.deepEqual(screen(map, '/admin/group#AdminGroup').access, {
    restricted: true,
    kinds: ['role'],
    route: [{ guard: 'isAdmin', kinds: ['role'] }],
    links: [{ from: '/home#Home', file: 'components/Home.js', line: 18, guards: [{ guard: 'isAdmin', kinds: ['role'] }], fromRestricted: false }],
  });
});

test('a setting held in a local const, even through another const, hides a link as a setting condition', async () => {
  const map = await buildFixture();
  const link = screen(map, '/help#Help').access.links.find((l) => l.from === '/document/:id#DocumentDetail');
  assert.deepEqual(link.guards, [{ guard: 'helpEnabled', kinds: ['setting'] }]);
});

test('a let is not followed, and a const that refers back to itself is followed once', async () => {
  const fromDetail = (map) => screen(map, '/help#Help').access.links.find((l) => l.from === '/document/:id#DocumentDetail');
  const withLet = await buildEditedCopy([['client/src/components/DocumentDetail.js', 'const helpEnabled =', 'let helpEnabled =']]);
  assert.deepEqual(fromDetail(withLet).guards, []);

  const looping = await buildEditedCopy([
    ['client/src/components/DocumentDetail.js', 'const helpEnabled = system.HELP_LINK_ENABLED;', 'const helpEnabled = () => system.HELP_LINK_ENABLED || helpEnabled();'],
    ['client/src/components/DocumentDetail.js', '{helpEnabled && <Link', '{helpEnabled() && <Link'],
  ]);
  assert.deepEqual(fromDetail(looping).guards, [{ guard: 'helpEnabled()', kinds: ['setting'] }]);
});

test('a role read from one member of a store object hides a link as a role condition', async () => {
  const map = await buildFixture();
  assert.deepEqual(screen(map, '/admin/audit#AdminAudit').access, {
    restricted: true,
    kinds: ['role'],
    route: [],
    links: [
      {
        from: '/home#Home',
        file: 'components/Home.js',
        line: 20,
        guards: [{ guard: "session['member.role'] === 'AUDITOR'", kinds: ['role'] }],
        fromRestricted: false,
      },
    ],
  });
});

test('a guard on another member of the same store object does not block', async () => {
  const map = await buildEditedCopy([['client/src/components/Home.js', "session['member.role'] === 'AUDITOR'", "session['member.id'] === 'AUDITOR'"]]);
  assert.equal(screen(map, '/admin/audit#AdminAudit').access.restricted, false);
  assert.deepEqual(screen(map, '/admin/audit#AdminAudit').access.links.map((l) => l.guards), [[]]);
});

for (const [name, edits] of [
  ['with optional chaining', [['client/src/components/Home.js', "session['member.role']", "session?.['member.role']"]]],
  ['in double quotes', [['client/src/components/Home.js', "session['member.role']", 'session["member.role"]']]],
  [
    'through a local const',
    [
      ['client/src/components/Home.js', "  const isAdmin = memberRole === 'ADMIN';\n", "  const isAdmin = memberRole === 'ADMIN';\n  const role = session['member.role'];\n"],
      ['client/src/components/Home.js', "{session['member.role'] === 'AUDITOR'", "{role === 'AUDITOR'"],
    ],
  ],
  [
    'as a dot access when the key is a plain name',
    [
      ['config.json', `"session['member.role']"`, `"session['role']"`],
      ['client/src/components/Home.js', "session['member.role']", 'session?.role'],
    ],
  ],
  [
    'as a bracket access when the entry is written with a dot',
    [
      ['config.json', `"session['member.role']"`, '"session.role"'],
      ['client/src/components/Home.js', "session['member.role']", "session['role']"],
    ],
  ],
]) {
  test(`a member role read ${name} is a role condition`, async () => {
    const map = await buildEditedCopy(edits);
    assert.deepEqual(screen(map, '/admin/audit#AdminAudit').access.links.map((l) => l.guards.map((g) => g.kinds)), [[['role']]]);
    assert.deepEqual(screen(map, '/admin/audit#AdminAudit').access.kinds, ['role']);
  });
}

test('a roleIdentifiers entry that is neither an identifier nor one member of an object is rejected', async () => {
  for (const entry of ["session['member.role'].name", 'session[role]', 'role()', 'session.member.role']) {
    await assert.rejects(buildEditedCopy([['config.json', '"memberRole"', JSON.stringify(entry)]]), (err) => err.message.includes(`roleIdentifiers entry ${JSON.stringify(entry)}`));
  }
});

test('a link to a path without its parameters enters every route that only adds parameters to it', async () => {
  const map = await buildFixture();
  const from = (id) => screen(map, id).access.links.map((l) => l.from);
  assert.deepEqual(from('/document/:tab_draft_done_#DocumentList'), ['/home#Home']);
  assert.deepEqual(from('/document/:id#DocumentDetail'), ['/document/:tab_draft_done_#DocumentList', '/home#Home']);
});

test('a guard that reads neither a setting nor a configured role identifier does not block', async () => {
  const map = await buildEditedCopy([
    ['config.json', '"roleIdentifiers": [\n    "memberRole",\n    "session[\'member.role\']"\n  ],\n', ''],
    ['client/src/components/SignIn.js', '{globalSettings.SYSTEM.HELP_LINK_ENABLED && (', '{showHelp && ('],
  ]);
  assert.deepEqual(restrictedKinds(map), { '/lab#Lab': ['setting'], '/lab/result#LabResult': ['setting'] });
  assert.deepEqual(screen(map, '/admin/member#AdminMember').access.route, []);
  assert.deepEqual(screen(map, '/help#Help').access.links.map((l) => l.guards), [[{ guard: 'helpEnabled', kinds: ['setting'] }], []]);
});

test('screens that link only to each other stay open', async () => {
  const map = await buildEditedCopy([
    [
      'client/src/Routes.js',
      '{globalSettings.SYSTEM.LAB_ENABLED ? <Route path={Option.ROUTE_PATH.LAB} component={waitFor(Lab)} exact /> : null}',
      '<Route path={Option.ROUTE_PATH.LAB} component={waitFor(Lab)} exact />',
    ],
    ['client/src/components/Home.js', '{globalSettings.SYSTEM.LAB_ENABLED && <Link to={Option.ROUTE_PATH.LAB}>Lab</Link>}', ''],
    [
      'client/src/components/LabResult.js',
      'export default function LabResult() {\n  return <section>Lab results</section>;',
      "import { Link } from 'react-router-dom';\nimport Option from '_define/Option';\n\nexport default function LabResult() {\n  return <Link to={Option.ROUTE_PATH.LAB}>Back</Link>;",
    ],
  ]);
  assert.deepEqual(screen(map, '/lab#Lab').access.links.map((l) => l.from), ['/lab/result#LabResult']);
  assert.deepEqual(restrictedKinds(map), {
    '/help#Help': ['setting'],
    '/admin/member#AdminMember': ['role'],
    '/admin/group#AdminGroup': ['role'],
    '/admin/audit#AdminAudit': ['role'],
  });
});

test('a back link does not open screens that are reached only through a guarded link', async () => {
  const map = await buildEditedCopy([
    ['client/src/components/LabResult.js', 'export default function LabResult() {\n  return <section>Lab results</section>;', "import { Link } from 'react-router-dom';\nimport Option from '_define/Option';\n\nexport default function LabResult() {\n  return <Link to={Option.ROUTE_PATH.LAB}>Back</Link>;"],
    ['client/src/components/Help.js', 'return <article>Help</article>;', 'return <article><Link to={Option.ROUTE_PATH.SIGN_IN}>Back</Link></article>;'],
    ['client/src/components/Help.js', 'export default function Help() {', "import { Link } from 'react-router-dom';\nimport Option from '_define/Option';\n\nexport default function Help() {"],
  ]);
  assert.deepEqual(restrictedKinds(map), {
    '/help#Help': ['setting'],
    '/admin/member#AdminMember': ['role'],
    '/admin/group#AdminGroup': ['role'],
    '/lab#Lab': ['setting'],
    '/lab/result#LabResult': ['setting'],
    '/admin/audit#AdminAudit': ['role'],
  });
});

for (const [name, use] of [
  ['without a guard', '<a onClick={openHelp}>?</a>'],
  ['under a guard that is neither a setting nor a role', '{form.touched && <a onClick={openHelp}>?</a>}'],
]) {
  test(`a handler also used ${name} leaves its link open`, async () => {
    const map = await buildEditedCopy([['client/src/components/SignIn.js', '    </form>', `      ${use}\n    </form>`]]);
    assert.equal(screen(map, '/help#Help').access.restricted, false);
    assert.deepEqual(screen(map, '/help#Help').access.links.map((l) => l.guards), [[{ guard: 'helpEnabled', kinds: ['setting'] }], []]);
  });
}

test('entry screens come from redirects in the routes file, screens no link leads to, and the config', async () => {
  const map = await buildFixture();
  assert.deepEqual(map.entries, [{ screen: '/signin#SignIn', reasons: [{ kind: 'redirect', file: 'Routes.js', line: 39 }, { kind: 'no-incoming-link' }] }]);
  assert.deepEqual(map.unknownEntryPaths, []);

  const configured = await buildEditedCopy([['config.json', '"roleIdentifiers"', '"entryPaths": ["/help", "/gone"],\n  "roleIdentifiers"']]);
  assert.deepEqual(configured.entries.map((e) => [e.screen, e.reasons.map((r) => r.kind)]), [
    ['/signin#SignIn', ['redirect', 'no-incoming-link']],
    ['/help#Help', ['config']],
  ]);
  assert.deepEqual(configured.unknownEntryPaths, ['/gone']);
  assert.equal(screen(configured, '/help#Help').access.restricted, false);
});

test('a redirect shown only under a setting or a role does not make its target an entry screen', async () => {
  const map = await buildEditedCopy([
    ['client/src/Routes.js', '      <Redirect to={Option.ROUTE_PATH.SIGN_IN} />', '      {globalSettings.SYSTEM.HELP_ENABLED && <Redirect from="/faq" to={Option.ROUTE_PATH.HELP} />}\n      <Redirect to={Option.ROUTE_PATH.SIGN_IN} />'],
  ]);
  assert.deepEqual(map.entries.map((e) => e.screen), ['/signin#SignIn']);
  assert.deepEqual(screen(map, '/help#Help').access.kinds, ['setting']);
});
