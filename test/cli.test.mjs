import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIXTURE = path.join(import.meta.dirname, 'fixtures/app');
const CLI = path.join(import.meta.dirname, '../src/cli.mjs');

test('rebuild writes map.json and tests.json to the configured output folder and prints a summary', () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'duru-test-'));
  try {
    fs.cpSync(FIXTURE, copy, { recursive: true, filter: (src) => !src.startsWith(path.join(FIXTURE, 'out')) });
    const stdout = execFileSync(process.execPath, [CLI, 'rebuild', path.join(copy, 'config.json')], { encoding: 'utf8' });

    const map = JSON.parse(fs.readFileSync(path.join(copy, 'out/map.json'), 'utf8'));
    const links = JSON.parse(fs.readFileSync(path.join(copy, 'out/tests.json'), 'utf8'));
    assert.equal(map.screens.length, 7);
    assert.deepEqual(Object.keys(links.nodes).sort(), ['/admin/member#AdminMember', '/document/:id#DocumentDetail', '/help#Help', '/home#Home', '/lab#Lab', '/signin#SignIn']);
    assert.match(stdout, /^screens 7 \|/m);
    assert.match(stdout, /^screens with tests 6\/7 \| tags pointing outside the map 2 \| tests without a node tag 3$/m);
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});

for (const args of [['nope', 'x.json'], ['extract', 'x.json', 'out.json']]) {
  test(`"${args.join(' ')}" prints usage and exits with 2`, () => {
    assert.throws(
      () => execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', stdio: 'pipe' }),
      (err) => err.status === 2 && /usage: duru <extract\|rebuild>/.test(err.stderr),
    );
  });
}
