import { extractClient } from './client.mjs';
import { loadServerEndpoints, matchEndpoint } from './server.mjs';

// JUnit 태그에 쓸 수 없는 문자. 이 문자만 없으면 Playwright · Vitest 제목에서도 그대로 태그로 쓸 수 있다.
const TAG_FORBIDDEN = /[\s,()&|!]+/g;

export function screenId(routePath, component) {
  return `${routePath}#${component}`.replace(TAG_FORBIDDEN, '_');
}

export async function buildMap(config) {
  const { screens, apiFunctions } = await extractClient(config);
  const server = config.serverEndpoints.flatMap(loadServerEndpoints);
  const apiPathPrefix = config.apiPathPrefix ?? '/';

  for (const fn of Object.values(apiFunctions)) {
    for (const e of fn.endpoints) e.server = matchEndpoint(server, e.method, e.url, apiPathPrefix);
  }

  const mapped = screens.map((s) => ({
    id: screenId(s.path, s.component),
    ...s,
    apiCalls: s.apiCalls.map((c) => ({ ...c, endpoints: apiFunctions[c.fn]?.endpoints ?? null })),
  }));

  const linesById = new Map();
  for (const s of mapped) linesById.set(s.id, [...(linesById.get(s.id) ?? []), s.line]);
  const duplicateIds = [...linesById].filter(([, lines]) => lines.length > 1).map(([id, lines]) => ({ id, lines }));

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
  };
}
