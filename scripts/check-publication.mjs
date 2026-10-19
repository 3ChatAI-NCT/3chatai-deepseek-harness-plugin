import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = /(^|\/)(node_modules|\.env(?:\..*)?|\.credentials[^/]*|\.DS_Store)(\/|$)|\.(pem|key|pyc)$/i;
const runtimeFiles = new Set(['dist/index.js', 'dist/tools.js', 'dist/client.js', 'dist/locale/en.json', 'dist/locale/zh.json', 'dist/THIRD_PARTY_NOTICES.md']);
const invalid = paths.filter(path => forbidden.test(path) || (path.startsWith('dist/') && !runtimeFiles.has(path)));
for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack']) {
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {};
  if (scripts[lifecycle]) throw new Error(`Git installation must not run ${lifecycle}`);
}
if (invalid.length) throw new Error(`Forbidden publication paths: ${invalid.join(', ')}`);
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
if (process.env.GITHUB_REF_TYPE === 'tag') {
  if (process.env.GITHUB_REF_NAME !== `v${manifest.version}`) throw new Error('Tag must match package.json version');
  execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
}
console.log(`Publication inputs verified (${paths.length} tracked files)`);
