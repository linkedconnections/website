import { readFile, writeFile } from 'node:fs/promises';

const notices = [
  ['@irail/planner', 'LICENSE'],
  ['apache-arrow', 'LICENSE.txt'],
  ['apache-arrow', 'NOTICE.txt'],
  ['flatbuffers', 'LICENSE'],
  ['json-with-bigint', 'LICENSE'],
  ['tslib', 'LICENSE.txt'],
  ['tslib', 'CopyrightNotice.txt']
];
const sections = ['Third-party notices for the bundled LC 2.0-alpha demo.\n'];
for (const [name, file] of notices) {
  const pkg = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
  sections.push(`${name} ${pkg.version} — ${file}\n\n${await readFile(`node_modules/${name}/${file}`, 'utf8')}`);
}
sections.push('uri-templates 0.2.0\n\nThis project is released as public-domain. Anybody can modify or re-license it for any purpose, without restriction.\nhttps://github.com/geraintluff/uri-templates');
await writeFile('js/demo/THIRD-PARTY-NOTICES.txt', sections.join('\n\n--------------------\n\n'));
