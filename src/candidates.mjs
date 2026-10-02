import fs from 'node:fs';
import path from 'node:path';
import { UNKNOWN } from './client.mjs';
import { compare, isPlainObject } from './config.mjs';
import { routePattern } from './path-values.mjs';
import { loadDiscarded, loadStories } from './stories.mjs';
import { checkStories, linksWithoutConditions, staleMapMessage } from './story-paths.mjs';

const SCHEME = /^[a-z][a-z\d+.-]*:/i;
const relative = (configDir, file) => path.relative(configDir, file).split(path.sep).join('/');

function recordFiles(source) {
  if (!fs.existsSync(source)) return { reason: '방문 기록 출처가 없습니다', files: [] };
  if (!fs.statSync(source).isDirectory()) return { files: [source] };
  try {
    return { files: fs.readdirSync(source, { recursive: true }).filter((f) => f.endsWith('.json')).map((f) => path.join(source, f)) };
  } catch (err) {
    return { reason: `방문 기록 폴더를 읽지 못했습니다: ${err.message}`, files: [] };
  }
}

function addressOf(url) {
  if (!SCHEME.test(url)) return url.split(/[?#]/)[0];
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

function readRecord(file) {
  let record;
  try {
    record = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { reason: `JSON 으로 읽지 못했습니다: ${err.message}` };
  }
  const steps = Array.isArray(record) ? record : isPlainObject(record) && Array.isArray(record.steps) ? record.steps : null;
  if (!steps) return { reason: '단계 배열이거나, steps 에 단계 배열을 담은 객체여야 합니다' };
  if (!steps.length) return { reason: '단계가 없습니다' };
  const addresses = [];
  for (const [i, step] of steps.entries()) {
    if (!isPlainObject(step) || typeof step.url !== 'string' || !step.url.trim()) return { reason: `${i + 1} 번째 단계에 url 이 없습니다` };
    const address = addressOf(step.url.trim());
    if (address === null) return { reason: `${i + 1} 번째 단계의 url 을 읽지 못했습니다` };
    addresses.push(address);
  }
  return { addresses };
}

export function loadVisitRecords(sources, configDir) {
  const records = [];
  const notices = [];
  const files = [];
  for (const source of sources) {
    const found = recordFiles(source);
    if (found.reason) notices.push({ file: relative(configDir, source), reason: found.reason });
    files.push(...found.files);
  }
  for (const file of [...new Set(files)].sort((a, b) => compare(relative(configDir, a), relative(configDir, b)))) {
    const { addresses, reason } = readRecord(file);
    const record = relative(configDir, file);
    if (reason) notices.push({ file: record, reason });
    else records.push({ record, name: path.basename(file, '.json'), addresses });
  }
  return { records, notices };
}

function screenFinder(map) {
  const routes = map.screens.filter((s) => !s.path.includes(UNKNOWN)).map((s) => ({ id: s.id, pattern: routePattern(s.path) }));
  return (address) => routes.find((r) => r.pattern.test(address))?.id ?? address;
}

function candidateOf({ record, name, addresses }, screenAt) {
  const screens = [];
  const stepRanges = [];
  addresses.forEach((address, i) => {
    const screen = screenAt(address);
    if (screen === screens.at(-1)) stepRanges.at(-1)[1] = i + 1;
    else {
      screens.push(screen);
      stepRanges.push([i + 1, i + 1]);
    }
  });
  return { name, screens, source: { record, steps: [1, addresses.length] }, stepRanges };
}

export function storyCandidates(config, map, mapFile) {
  const { records, notices } = loadVisitRecords(config.visitRecords, config.configDir);
  const { discarded, notices: discardedNotices } = loadDiscarded(config.storiesDir);
  const all = [...notices, ...discardedNotices.map((n) => ({ ...n, file: relative(config.configDir, path.join(config.storiesDir, n.file)) }))];
  if (linksWithoutConditions(map)) {
    return { list: [], notices: all, ...(records.length && { stale: staleMapMessage(mapFile, '후보') }) };
  }
  const screenAt = screenFinder(map);
  const seen = new Set([...loadStories(config.storiesDir).stories, ...discarded].map((s) => JSON.stringify(s.screens)));
  const list = [];
  for (const record of records) {
    const candidate = candidateOf(record, screenAt);
    const key = JSON.stringify(candidate.screens);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(candidate);
  }
  return { list: checkStories(map, list), notices: all };
}
