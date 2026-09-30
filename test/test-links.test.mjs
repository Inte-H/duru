import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { buildMap } from '../src/map.mjs';
import { linkTests } from '../src/test-links.mjs';

const FIXTURE_CONFIG = path.join(import.meta.dirname, 'fixtures/app/config.json');
const config = loadConfig(FIXTURE_CONFIG);
const links = linkTests(config, await buildMap(config));
const summary = (id) => (links.nodes[id] ?? []).map((t) => `${t.project} ${t.depth} ${t.status}`);

test('a tagged Playwright test attaches to its screen with the configured depth and its status', () => {
  assert.deepEqual(summary('/home#Home'), ['chromium ui pass', 'firefox ui pass']);
  assert.deepEqual(summary('/admin/member#AdminMember'), ['chromium ui fail']);
  const [home] = links.nodes['/home#Home'];
  assert.equal(home.title, 'shows the document list @screen:/home#Home');
  assert.equal(home.file, 'home.spec.ts');
  assert.equal(home.line, 3);
  assert.equal(home.source, 'results/playwright/e2e.json');
});

test('a skipped test is pending', () => {
  assert.deepEqual(summary('/lab#Lab'), ['chromium ui pending']);
});

test('a test tagged with two screens attaches to both', () => {
  assert.deepEqual(summary('/signin#SignIn'), ['chromium ui pass']);
  assert.deepEqual(summary('/help#Help'), ['chromium ui pass']);
});

test('tags pointing outside the map and tests without a node tag are reported separately, once per test across projects', () => {
  assert.deepEqual(
    links.unknownTags.map((u) => `${u.tag} ${u.test.file}:${u.test.line}`),
    ['screen:/settings#Settings home.spec.ts:26'],
  );
  assert.equal(links.untaggedCount, 1);
  assert.equal(Object.keys(links.nodes).includes('/settings#Settings'), false);
  assert.deepEqual(links.missingSources, []);
});

function withResults(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duru-test-'));
  try {
    fs.mkdirSync(path.join(dir, 'results'));
    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'results', name), body);
    const own = { ...config, configDir: dir, tests: [{ format: 'playwright', path: path.join(dir, 'results'), depth: 'ui' }] };
    return fn(own, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const reportOf = (suites) => JSON.stringify({ suites });

test('without a tags field, tags are read from the test title and the titles of its describe blocks', () => {
  const report = reportOf([
    {
      title: 'a.spec.ts',
      specs: [{ title: 'opens help @screen:/help#Help', file: 'a.spec.ts', line: 1, tests: [{ projectName: 'chromium', status: 'expected' }] }],
      suites: [
        {
          title: 'home @screen:/home#Home',
          specs: [{ title: 'loads', file: 'a.spec.ts', line: 5, tests: [{ projectName: 'chromium', status: 'unexpected' }] }],
        },
      ],
    },
  ]);
  withResults({ 'report.json': report }, (own) => {
    const result = linkTests(own, { screens: [{ id: '/help#Help' }, { id: '/home#Home' }] });
    assert.deepEqual(result.nodes['/help#Help'].map((t) => t.status), ['pass']);
    assert.deepEqual(result.nodes['/home#Home'].map((t) => t.status), ['fail']);
  });
});

test('JSON in a results folder that is not a Playwright report is skipped', () => {
  const report = reportOf([{ title: 'a.spec.ts', specs: [{ title: 'x @screen:/help#Help', file: 'a.spec.ts', line: 1, tests: [{ status: 'expected' }] }] }]);
  withResults({ 'report.json': report, '.last-run.json': '{"status":"passed"}' }, (own) => {
    const result = linkTests(own, { screens: [{ id: '/help#Help' }] });
    assert.equal(result.nodes['/help#Help'].length, 1);
    assert.equal(result.untaggedCount, 0);
  });
});

test('a broken report names the file it could not read', () => {
  withResults({ 'broken.json': '{"suites": [' }, (own, dir) => {
    assert.throws(() => linkTests(own, { screens: [] }), (err) => err.message.includes(path.join(dir, 'results', 'broken.json')));
  });
});

test('a configured results path that does not exist yet is reported instead of stopping the rebuild', () => {
  const own = { ...config, tests: [{ format: 'playwright', path: path.join(config.configDir, 'results/not-run-yet'), depth: 'api' }] };
  const result = linkTests(own, { screens: [] });
  assert.deepEqual(result.missingSources, ['results/not-run-yet']);
  assert.deepEqual(result.nodes, {});
});

test('an unknown depth in the config is rejected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duru-test-'));
  try {
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, JSON.stringify({ srcRoot: '.', serverEndpoints: [], tests: [{ format: 'playwright', path: 'r', depth: 'e2e' }] }));
    assert.throws(() => loadConfig(file), /unknown depth "e2e"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
