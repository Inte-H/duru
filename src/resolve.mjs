import fs from 'node:fs';
import path from 'node:path';

const EXTENSIONS = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];

function firstFile(base) {
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// 상대 경로와, srcRoot 를 기준으로 한 별칭 경로(baseUrl)를 푼다. 바깥 패키지는 null.
export function resolveImport(srcRoot, fromFile, spec) {
  if (spec.startsWith('.')) return firstFile(path.resolve(path.dirname(fromFile), spec));
  const first = spec.split('/')[0];
  if (first.startsWith('@')) return null;
  if (!fs.existsSync(path.join(srcRoot, first))) return null;
  return firstFile(path.join(srcRoot, spec));
}
