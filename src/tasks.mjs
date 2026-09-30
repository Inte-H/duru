import path from 'node:path';
import { reviewData } from './review.mjs';
import { DEPTHS } from './test-links.mjs';

const OPEN = ['needs-more', 'missing'];
const KIND_NAMES = { setting: 'a setting', role: 'a role' };

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const guardText = (g) => `\`${g.guard}\`${g.via ? ` through ${g.via}` : ''} (${g.kinds.join(', ')})`;

function markLine(mark) {
  const where = mark.target.depth ? `${mark.target.depth} depth` : 'whole screen';
  const note = mark.note ? ` — "${mark.note.replace(/\r?\n/g, '\n    ')}"` : '';
  return `  - ${mark.status}, ${where}${note} (${mark.author}, ${mark.date.slice(0, 10)})`;
}

function accessLines(access) {
  if (!access.restricted) return ['- access: opens without a setting or role'];
  return [
    `- access: needs ${access.kinds.map((k) => KIND_NAMES[k]).join(' and ')}`,
    ...access.route.map((g) => `  - route guard ${guardText(g)}`),
    ...access.links.map((l) => {
      const from = `  - link from ${l.from} at ${l.file}:${l.line}`;
      if (l.guards.length) return `${from}, guard ${l.guards.map(guardText).join('; ')}`;
      return l.fromRestricted ? `${from}, no guard, but ${l.from} needs one itself` : `${from}, no guard`;
    }),
  ];
}

const byDepth = (tests) => [...tests].sort((a, b) => DEPTHS.indexOf(a.depth) - DEPTHS.indexOf(b.depth));

function testSummary(tests) {
  if (!tests?.length) return 'no tests';
  const counts = new Map();
  for (const t of byDepth(tests)) counts.set(`${t.depth} ${t.status}`, (counts.get(`${t.depth} ${t.status}`) ?? 0) + 1);
  return 'tests: ' + [...counts].map(([k, n]) => `${k} ${n}`).join(', ');
}

function callLines(screen, tests) {
  const seen = new Set();
  const lines = [];
  for (const call of screen.apiCalls) {
    if (!call.endpoints) {
      lines.push(`  - ${call.fn} at ${call.file}:${call.line} — not found among the API functions`);
      continue;
    }
    for (const e of call.endpoints) {
      if (!e.callId) {
        lines.push(`  - ${call.fn} at ${call.file}:${call.line} — address not resolved`);
        continue;
      }
      if (seen.has(e.callId)) continue;
      seen.add(e.callId);
      const server = e.server.status === 'none' ? 'not on the server, ' : '';
      lines.push(`  - ${e.callId} — ${server}${testSummary(tests[e.callId])}`);
    }
  }
  return lines.length ? ['- calls:', ...lines] : ['- calls: none'];
}

function testLines(tests) {
  if (!tests?.length) return ['- tests: none'];
  return [
    '- tests:',
    ...byDepth(tests).map((t) => {
      const at = t.line ? `${t.file}:${t.line}` : t.file;
      const detail = t.detail ? ` — ${t.detail}` : '';
      return `  - ${t.depth} ${t.status} — ${t.title} — ${at}${t.project ? ` (${t.project})` : ''}${detail}`;
    }),
  ];
}

export function taskList(config) {
  const { map, tests, marks, appLinks } = reviewData(config, null);
  const open = marks.attached.filter((m) => OPEN.includes(m.current.status));
  const screens = map.screens.filter((s) => open.some((m) => m.target.node === s.id)).sort((a, b) => a.id.localeCompare(b.id));

  const out = [
    `# Test tasks — ${count(screens.length, 'screen')}, ${count(open.length, 'open mark')}`,
    '',
    'A reviewer marked these screens as needing more tests (`needs-more`) or as having none (`missing`). Write the tests, put `@screen:<screen ID>` in each test title (`@call:<call ID>` for a test of one API call), add `@depth:<ui|api|render|code|data>` when the depth of the result source does not fit, then run `duru rebuild` and read this list again. A screen stays here until a reviewer marks it `fine`.',
    '',
    `Source files are under \`${path.relative(config.configDir, config.srcRoot).split(path.sep).join('/')}\`.`,
  ];
  if (!screens.length) out.push('', 'No open marks.');
  for (const s of screens) {
    out.push(
      '',
      `## ${s.id}`,
      '',
      '- marks:',
      ...open.filter((m) => m.target.node === s.id).map((m) => markLine(m.current)),
      `- component: ${s.componentFile}, route at ${config.routesFile}:${s.line}`,
      ...(appLinks[s.id] ? [`- app: ${appLinks[s.id]}`] : []),
      ...accessLines(s.access),
      ...callLines(s, tests.nodes),
      ...testLines(tests.nodes[s.id]),
    );
  }
  return out.join('\n') + '\n';
}
