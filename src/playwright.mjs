import fs from 'node:fs';

const STATUS = { expected: 'pass', flaky: 'pass', unexpected: 'fail', skipped: 'pending' };

// Playwright 보고서가 아닌 JSON(suites 배열이 없음)이면 null 을 돌려준다.
export function readPlaywright(file) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read Playwright report ${file}: ${err.message}`);
  }
  if (!Array.isArray(report?.suites)) return null;

  const out = [];
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      const tags = new Set((spec.tags ?? []).map((t) => t.replace(/^@/, '')));
      for (const t of [...titles, spec.title].join(' ').match(/@\S+/g) ?? []) tags.add(t.slice(1));
      for (const test of spec.tests ?? []) {
        out.push({
          title: [...titles, spec.title].join(' › '),
          file: spec.file,
          line: spec.line,
          project: test.projectName ?? null,
          tags: [...tags],
          status: STATUS[test.status] ?? 'pending',
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
  };
  // 최상위 suite 는 파일이라 제목에 넣지 않는다.
  for (const top of report.suites) walk(top, []);
  return out;
}
