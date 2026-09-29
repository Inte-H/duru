import fs from 'node:fs';

// 한 줄에 「라벨<TAB>METHOD<TAB>경로」. 경로 변수 {id} 는 한 칸짜리 자리로 본다.
export function loadServerEndpoints(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const [label, method, p] = l.split('\t');
      return { label, method, path: p, segments: toSegments(p) };
    });
}

function toSegments(p) {
  return p
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((s) => (/^\{.*\}$/.test(s) || s.includes('{?}') ? '*' : s));
}

function sameShape(a, b) {
  return a.length === b.length && a.every((s, i) => s === '*' || b[i] === '*' || s === b[i]);
}

export function matchEndpoint(server, method, url, apiPathPrefix) {
  if (typeof url !== 'string') return { status: 'unresolved' };
  let p = url.startsWith(apiPathPrefix) ? url.slice(apiPathPrefix.length) : url;
  if (!p.startsWith('/')) p = '/' + p;
  const segs = toSegments(p);
  if (segs.length === 0 || segs[0] === '*') return { status: 'unresolved' };
  const byPath = server.filter((e) => sameShape(e.segments, segs));
  if (byPath.length === 0) return { status: 'none' };
  const byMethod = method ? byPath.filter((e) => e.method === method) : byPath;
  if (byMethod.length === 0) return { status: 'method-mismatch', candidates: byPath.map((e) => `${e.label} ${e.method} ${e.path}`) };
  return { status: 'match', labels: [...new Set(byMethod.map((e) => e.label))] };
}
