import path from 'node:path';
import { reviewData } from './review.mjs';
import { DEPTHS } from './test-links.mjs';

const OPEN = ['needs-more', 'missing'];
const KIND_NAMES = { setting: 'a setting', role: 'a role' };

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const guardText = (g) => `\`${g.guard}\`${g.via ? ` through ${g.via}` : ''} (${g.kinds.join(', ')})`;

function markLine(mark, whole) {
  const where = mark.target.depth ? `${mark.target.depth} depth` : whole;
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

function optionLines(keys, tests) {
  const rows = keys.flatMap((key) =>
    [true, false].map((value) => [`${key}=${value}`, tests.filter((t) => t.options?.some((o) => o.key === key && o.value === value))]),
  );
  rows.push(['no option tag', tests.filter((t) => !t.options?.length)]);
  return rows.map(([label, matching]) => `    - ${label} — ${testSummary(matching)}`);
}

function callLines(screen, tests) {
  const optionKeys = new Map();
  for (const call of screen.apiCalls) {
    for (const e of call.endpoints ?? []) {
      if (!e.callId) continue;
      if (!optionKeys.has(e.callId)) optionKeys.set(e.callId, new Set());
      for (const o of call.options ?? []) optionKeys.get(e.callId).add(o.key);
    }
  }
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
      const options = [...optionKeys.get(e.callId)].sort();
      lines.push(`  - ${e.callId} — ${server}${testSummary(tests[e.callId])}${options.length ? ` — options: ${options.join(', ')}` : ''}`);
      if (options.length) lines.push(...optionLines(options, tests[e.callId] ?? []));
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

function serverText(server) {
  if (server.status === 'match') return `on the server (${server.labels.join(', ')})`;
  if (server.status === 'method-mismatch') return `method mismatch — the server has ${server.candidates.join('; ')}`;
  return 'not on the server';
}

export function taskList(config) {
  const { map, tests, marks, appLinks } = reviewData(config, null);
  const open = marks.attached.filter((m) => OPEN.includes(m.current.status));
  const marked = (node) => open.some((m) => m.target.node === node.id);
  const screens = map.screens.filter(marked).sort((a, b) => a.id.localeCompare(b.id));
  const calls = map.calls.filter(marked);

  const out = [
    `# Test tasks — ${count(screens.length, 'screen')}, ${count(calls.length, 'call')}, ${count(open.length, 'open mark')}`,
    '',
    `A reviewer marked these screens and API calls as needing more tests (\`needs-more\`) or as having none (\`missing\`). Write the tests, put \`@screen:<screen ID>\` in each test title (\`@call:<call ID>\` for a test of one API call, with \`@option:<key>=true|false\` for each on/off option the test sets), add \`@depth:<${DEPTHS.join('|')}>\` when the depth of the result source does not fit, then run \`duru rebuild\` and read this list again. A screen or call stays here until a reviewer marks it \`fine\`.`,
    '',
    `Source files are under \`${path.relative(config.configDir, config.srcRoot).split(path.sep).join('/')}\`.`,
  ];
  if (!open.length) out.push('', 'No open marks.');
  for (const s of screens) {
    out.push(
      '',
      `## ${s.id}`,
      '',
      '- marks:',
      ...open.filter((m) => m.target.node === s.id).map((m) => markLine(m.current, 'whole screen')),
      `- component: ${s.componentFile}, route at ${config.routesFile}:${s.line}`,
      ...(appLinks[s.id] ? [`- app: ${appLinks[s.id]}`] : []),
      ...accessLines(s.access),
      ...callLines(s, tests.nodes),
      ...testLines(tests.nodes[s.id]),
    );
  }
  if (calls.length) out.push('', '# API calls');
  for (const c of calls) {
    out.push(
      '',
      `## ${c.id}`,
      '',
      '- marks:',
      ...open.filter((m) => m.target.node === c.id).map((m) => markLine(m.current, 'whole call')),
      `- called from: ${c.screens.length ? c.screens.join(', ') : 'no screen'}`,
      `- server: ${serverText(c.server)}`,
      ...testLines(tests.nodes[c.id]),
    );
  }
  return out.join('\n') + '\n';
}
