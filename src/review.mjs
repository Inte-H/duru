import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { UNKNOWN } from './client.mjs';
import { buildFlow } from './flow.mjs';
import { addMark, classifyMarks, loadMarks } from './marks.mjs';
import { DEPTHS } from './test-links.mjs';

const PAGE = path.join(import.meta.dirname, 'review-page.html');
const BODY_LIMIT = 64 * 1024;

export function gitUserName(cwd) {
  try {
    return execFileSync('git', ['config', 'user.name'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`${file} does not exist — run "duru rebuild" first`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function appLink(appUrl, routePath) {
  if (!appUrl || /[:*]/.test(routePath) || routePath.includes(UNKNOWN)) return null;
  return appUrl.replace(/\/+$/, '') + routePath;
}

export function reviewData(config, author) {
  const map = readJson(path.join(config.outDir, 'map.json'));
  const tests = readJson(path.join(config.outDir, 'tests.json'));
  return {
    map,
    tests,
    marks: classifyMarks(loadMarks(config.marksDir), map),
    flow: buildFlow(map, tests),
    appUrl: config.appUrl ?? null,
    appLinks: Object.fromEntries(map.screens.map((s) => [s.id, appLink(config.appUrl, s.path)])),
    routesFile: config.routesFile,
    depths: DEPTHS,
    author,
  };
}

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > BODY_LIMIT) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export function startReviewServer(config, { port = 0, author = null } = {}) {
  // 다른 사이트가 사용자의 브라우저로 표시를 써 넣거나(JSON 이 아닌 요청), 자기 도메인을 이 주소로 돌려 지도를 읽어 가는 것(다른 Host)을 막는다.
  const ownHosts = () => [`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`];
  const server = http.createServer(async (req, res) => {
    try {
      if (!ownHosts().includes(req.headers.host)) return send(res, 403, 'text/plain', 'forbidden host');
      if (req.method === 'GET' && req.url === '/') return send(res, 200, 'text/html', fs.readFileSync(PAGE, 'utf8'));
      if (req.method === 'GET' && req.url === '/api/data') return send(res, 200, 'application/json', JSON.stringify(reviewData(config, author)));
      if (req.method === 'POST' && req.url === '/api/marks') {
        if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, 'text/plain', 'expected application/json');
        let input;
        try {
          input = JSON.parse(await readBody(req));
        } catch (err) {
          return send(res, 400, 'text/plain', err.message);
        }
        try {
          const mark = addMark(config.marksDir, { ...input, author: author ?? input.author });
          return send(res, 201, 'application/json', JSON.stringify(mark));
        } catch (err) {
          return send(res, 400, 'text/plain', err.message);
        }
      }
      send(res, 404, 'text/plain', 'not found');
    } catch (err) {
      send(res, 500, 'text/plain', err.message);
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
