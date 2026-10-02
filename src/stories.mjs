import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { compare, isPlainObject } from './config.mjs';
import { fileSafe } from './marks.mjs';

const STORY_ID = /^[a-z0-9_-]+$/;
const KEYS = ['name', 'screens', 'memo', 'author', 'date', 'source'];
const DISCARDED = 'discarded';
const DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isScreenList = (v) => Array.isArray(v) && v.length > 0 && v.every(isText);
const isStep = (v) => Number.isInteger(v) && v > 0;
const isSource = (v) => isPlainObject(v) && Object.keys(v).length === 2 && isText(v.record)
  && Array.isArray(v.steps) && v.steps.length === 2 && v.steps.every(isStep) && v.steps[0] <= v.steps[1];
// Date.parse 는 2026-02-30 을 3월 2일로 넘겨 받으므로, 날짜 부분이 그대로 되돌아오는지 본다.
const isDate = (v) => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(v))
  && new Date(`${v.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === v.slice(0, 10);

function problemOf(story) {
  if (!isPlainObject(story)) return '스토리는 JSON 객체여야 합니다';
  const unknown = Object.keys(story).filter((k) => !KEYS.includes(k));
  if (unknown.length) {
    return `모르는 항목이 있습니다: ${unknown.join(', ')}${unknown.includes('id') ? ' (스토리 ID 는 파일 이름에서 정합니다)' : ''}`;
  }
  if (!isText(story.name)) return 'name 에 스토리 이름을 적어야 합니다';
  const { screens } = story;
  if (!isScreenList(screens)) return 'screens 는 화면 ID 를 하나 이상 차례대로 담은 목록이어야 합니다';
  const repeated = screens.findIndex((s, i) => i > 0 && s === screens[i - 1]);
  if (repeated > 0) return `screens 의 ${repeated} 번째와 ${repeated + 1} 번째가 같은 화면입니다`;
  if (story.memo !== undefined && typeof story.memo !== 'string') return 'memo 는 글자여야 합니다';
  if (!isText(story.author)) return 'author 에 작성자를 적어야 합니다';
  if (!isDate(story.date)) return 'date 는 2026-10-02 같은 날짜여야 합니다';
  if (story.source !== undefined && !isSource(story.source)) return 'source 는 { "record": 기록 파일, "steps": [첫 단계, 끝 단계] } 여야 합니다';
  return null;
}

// 폴더를 가리키는 링크는 readdirSync 가 이미 따라 들어갔으므로 null 로 건너뛴다.
function linkedFile(file) {
  try {
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat) return { reason: '링크가 가리키는 파일이 없습니다' };
    return stat.isFile() ? {} : null;
  } catch (err) {
    return { reason: `링크를 따라가지 못했습니다: ${err.message}` };
  }
}

function storyFiles(dir) {
  if (!fs.statSync(dir).isDirectory()) return { root: path.dirname(dir), files: [{ file: path.basename(dir) }] };
  let entries;
  try {
    entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
  } catch (err) {
    return { root: dir, files: [{ file: dir, reason: `스토리 폴더를 읽지 못했습니다: ${err.message}` }] };
  }
  const files = entries
    .filter((e) => e.name.endsWith('.json') && (e.isFile() || e.isSymbolicLink()))
    .flatMap((e) => {
      const full = path.join(e.parentPath, e.name);
      const file = path.relative(dir, full);
      if (file.split(path.sep)[0] === DISCARDED) return [];
      const read = e.isSymbolicLink() ? linkedFile(full) : {};
      return read ? [{ file, ...read }] : [];
    })
    .sort((a, b) => compare(a.file, b.file));
  return { root: dir, files };
}

export function loadStories(dir) {
  if (!fs.existsSync(dir)) return { stories: [], notices: [] };
  const { root, files } = storyFiles(dir);
  const stories = [];
  const notices = [];
  const fileOfId = new Map();
  for (const { file, reason } of files) {
    if (reason) {
      notices.push({ file, reason });
      continue;
    }
    const id = path.basename(file, '.json');
    if (!STORY_ID.test(id)) {
      notices.push({ file, reason: '파일 이름이 스토리 ID 규칙(영문 소문자 · 숫자 · - · _)에 맞지 않습니다' });
      continue;
    }
    if (fileOfId.has(id)) {
      notices.push({ file, reason: `스토리 ID ${id} 는 ${fileOfId.get(id)} 에서 이미 썼습니다` });
      continue;
    }
    fileOfId.set(id, file);
    let story;
    try {
      story = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    } catch (err) {
      notices.push({ file, reason: `JSON 으로 읽지 못했습니다: ${err.message}` });
      continue;
    }
    const problem = problemOf(story);
    if (problem) {
      notices.push({ file, reason: problem });
      continue;
    }
    stories.push({ id, name: story.name, screens: story.screens, memo: story.memo ?? '', author: story.author, date: story.date, ...(story.source && { source: story.source }), file });
  }
  return { stories: stories.sort((a, b) => compare(a.id, b.id)), notices };
}

function discardedProblemOf(d) {
  if (!isPlainObject(d)) return '버린 후보는 JSON 객체여야 합니다';
  if (!isScreenList(d.screens)) return 'screens 는 화면을 하나 이상 차례대로 담은 목록이어야 합니다';
  if (!isText(d.reason)) return 'reason 에 버린 까닭을 적어야 합니다';
  if (!isText(d.author)) return 'author 에 작성자를 적어야 합니다';
  if (!isDate(d.date)) return 'date 는 2026-10-02 같은 날짜여야 합니다';
  return null;
}

export function loadDiscarded(dir) {
  const folder = path.join(dir, DISCARDED);
  if (!fs.existsSync(folder)) return { discarded: [], notices: [] };
  if (!fs.statSync(folder).isDirectory()) return { discarded: [], notices: [{ file: DISCARDED, reason: `${DISCARDED} 는 버린 후보를 담는 폴더여야 합니다` }] };
  let files;
  try {
    files = fs.readdirSync(folder, { recursive: true }).filter((f) => f.endsWith('.json')).sort(compare);
  } catch (err) {
    return { discarded: [], notices: [{ file: DISCARDED, reason: `버린 후보 폴더를 읽지 못했습니다: ${err.message}` }] };
  }
  const discarded = [];
  const notices = [];
  for (const f of files) {
    const file = path.join(DISCARDED, f);
    let d;
    try {
      d = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (err) {
      notices.push({ file, reason: `JSON 으로 읽지 못했습니다: ${err.message}` });
      continue;
    }
    const problem = discardedProblemOf(d);
    if (problem) notices.push({ file, reason: problem });
    else discarded.push({ ...d, file });
  }
  return { discarded, notices };
}

function writableFolder(dir) {
  if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) throw new Error(`스토리 폴더 ${dir} 가 파일이라 새 파일을 쓸 수 없습니다`);
  fs.mkdirSync(dir, { recursive: true });
}

const needAuthor = (author) => {
  if (!isText(author)) throw new Error('작성자가 필요합니다');
  return author.trim();
};

export function acceptCandidate(dir, candidate, { id, name, author }, now = new Date()) {
  if (typeof id !== 'string' || !STORY_ID.test(id)) throw new Error('스토리 ID 는 영문 소문자 · 숫자 · - · _ 로만 씁니다');
  if (!isText(name)) throw new Error('스토리 이름이 필요합니다');
  const by = needAuthor(author);
  writableFolder(dir);
  const taken = storyFiles(dir).files.find((f) => path.basename(f.file) === `${id}.json`);
  if (taken) throw new Error(`스토리 ID ${id} 는 ${taken.file} 이 이미 씁니다`);
  const story = { name: name.trim(), screens: candidate.screens, memo: '', author: by, date: now.toISOString(), source: candidate.source };
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(story, null, 2) + '\n', { flag: 'wx' });
  return { id, ...story, file: `${id}.json` };
}

export function discardCandidate(dir, candidate, { reason, author }, now = new Date()) {
  if (!isText(reason)) throw new Error('버리는 까닭이 필요합니다');
  const by = needAuthor(author);
  writableFolder(dir);
  const folder = path.join(dir, DISCARDED);
  if (fs.existsSync(folder) && !fs.statSync(folder).isDirectory()) throw new Error(`스토리 폴더 안 ${DISCARDED} 가 파일이라 버린 후보를 쓸 수 없습니다`);
  fs.mkdirSync(folder, { recursive: true });
  const discarded = { name: candidate.name, screens: candidate.screens, reason: reason.trim(), author: by, date: now.toISOString(), source: candidate.source };
  const file = `${discarded.date.slice(0, 10)}-${fileSafe(by)}-${crypto.randomUUID().slice(0, 8)}.json`;
  fs.writeFileSync(path.join(folder, file), JSON.stringify(discarded, null, 2) + '\n', { flag: 'wx' });
  return { ...discarded, file: path.join(DISCARDED, file) };
}

export function editStory(dir, id, { name, memo }) {
  if (!isText(name)) throw new Error('스토리 이름이 필요합니다');
  if (typeof memo !== 'string') throw new Error('메모는 글자여야 합니다');
  const story = loadStories(dir).stories.find((s) => s.id === id);
  if (!story) throw new Error(`스토리 ${id} 를 찾지 못했습니다`);
  const file = path.join(storyFiles(dir).root, story.file);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...raw, name: name.trim(), memo }, null, 2) + '\n');
  return { ...story, name: name.trim(), memo };
}
