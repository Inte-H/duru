import fs from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  ignoreDeclaration: true,
  htmlEntities: true,
  isArray: (name) => name === 'testsuite' || name === 'testcase',
});

const statusOf = (testcase) => {
  if (testcase.failure !== undefined || testcase.error !== undefined) return 'fail';
  if (testcase.skipped !== undefined) return 'pending';
  return 'pass';
};

// 루트가 <testsuites> 도 <testsuite> 도 아닌 XML 이면 null 을 돌려준다.
export function readJunit(file) {
  let doc;
  try {
    doc = parser.parse(fs.readFileSync(file, 'utf8'), true);
  } catch (err) {
    throw new Error(`cannot read JUnit report ${file}: ${err.message}`);
  }
  if (doc.testsuites === undefined && doc.testsuite === undefined) return null;

  const out = [];
  const walk = (suite, suiteTitles) => {
    const here = [...suiteTitles, suite.name].filter(Boolean);
    for (const testcase of suite.testcase ?? []) {
      const titles = [...here, testcase.name].filter(Boolean);
      out.push({
        title: titles.join(' › '),
        file: testcase.classname ?? null,
        line: null,
        project: null,
        tags: [...new Set((titles.join(' ').match(/@\S+/g) ?? []).map((t) => t.slice(1)))],
        status: statusOf(testcase),
      });
    }
    for (const child of suite.testsuite ?? []) walk(child, here);
  };
  for (const suite of doc.testsuites?.testsuite ?? doc.testsuite ?? []) walk(suite, []);
  return out;
}
