import { extractClient, UNKNOWN } from './client.mjs';
import { clientPath, loadServerEndpoints, matchEndpoint } from './server.mjs';
import { screenAccess } from './access.mjs';

// JUnit 태그에 쓸 수 없는 문자. 이 문자만 없으면 Playwright · Vitest 제목에서도 그대로 태그로 쓸 수 있다.
const TAG_FORBIDDEN = /[\s,()&|!]+/g;

export function screenId(routePath, component) {
  return `${routePath}#${component}`.replace(TAG_FORBIDDEN, '_');
}

function callOf(e, apiPathPrefix) {
  if (e.server.status === 'unresolved') return null;
  const method = e.method ?? UNKNOWN;
  const p = e.server.path ?? clientPath(e.url, apiPathPrefix);
  return { id: `${method}:${p}`.replace(TAG_FORBIDDEN, '_'), method, path: p };
}

function buildCalls(apiFunctions, screens, apiPathPrefix) {
  const calls = new Map();
  for (const [name, fn] of Object.entries(apiFunctions)) {
    for (const e of fn.endpoints) {
      const call = callOf(e, apiPathPrefix);
      if (!call) continue;
      if (!calls.has(call.id)) calls.set(call.id, { ...call, server: { ...e.server }, apiFunctions: new Set(), screens: new Set() });
      const node = calls.get(call.id);
      node.apiFunctions.add(name);
      if (e.server.candidates) node.server.candidates = [...new Set([...node.server.candidates, ...e.server.candidates])].sort();
    }
  }
  for (const s of screens) {
    for (const c of s.apiCalls) {
      for (const e of c.endpoints ?? []) if (e.callId) calls.get(e.callId).screens.add(s.id);
    }
  }
  return [...calls.values()]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((c) => ({ ...c, apiFunctions: [...c.apiFunctions].sort(), screens: [...c.screens].sort() }));
}

export async function buildMap(config) {
  const { screens, apiFunctions, redirects, guardInits } = await extractClient(config);
  const server = config.serverEndpoints.flatMap(loadServerEndpoints);
  const apiPathPrefix = config.apiPathPrefix ?? '/';

  for (const fn of Object.values(apiFunctions)) {
    for (const e of fn.endpoints) {
      e.server = matchEndpoint(server, e.method, e.url, apiPathPrefix);
      e.callId = callOf(e, apiPathPrefix)?.id ?? null;
    }
  }

  const mapped = screens.map((s) => ({
    id: screenId(s.path, s.component),
    ...s,
    apiCalls: s.apiCalls.map((c) => ({ ...c, endpoints: apiFunctions[c.fn]?.endpoints ?? null })),
  }));
  const { access, entries, unknownEntryPaths } = screenAccess(mapped, redirects, config, guardInits);
  mapped.forEach((s, i) => (s.access = access[i]));

  const linesById = new Map();
  for (const s of mapped) linesById.set(s.id, [...(linesById.get(s.id) ?? []), s.line]);
  const duplicateIds = [...linesById].filter(([, lines]) => lines.length > 1).map(([id, lines]) => ({ id, lines }));

  for (const s of mapped) s.dead = s.apiCalls.some((c) => (c.endpoints ?? []).some((e) => e.server.status === 'none'));

  const deadCalls = [];
  for (const s of mapped) {
    for (const c of s.apiCalls) {
      for (const e of c.endpoints ?? []) {
        if (e.server.status === 'none') deadCalls.push({ screen: s.id, fn: c.fn, method: e.method, url: e.url, callSite: `${c.file}:${c.line}` });
      }
    }
  }

  return {
    meta: { generatedAt: new Date().toISOString(), srcRoot: config.srcRoot, clientRef: config.clientRef ?? null, serverRef: config.serverRef ?? null },
    screens: mapped,
    apiFunctions,
    deadCalls,
    duplicateIds,
    calls: buildCalls(apiFunctions, mapped, apiPathPrefix),
    entries,
    unknownEntryPaths,
  };
}
