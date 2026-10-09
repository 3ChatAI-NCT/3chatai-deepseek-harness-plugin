import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = /(^|\/)(node_modules|dist|\.env(?:\..*)?|\.credentials[^/]*|\.DS_Store)(\/|$)|\.(pem|key|pyc)$/i;
const invalid = paths.filter(path => forbidden.test(path));
if (invalid.length) throw new Error(`Forbidden publication paths: ${invalid.join(', ')}`);
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
if (process.env.GITHUB_REF_TYPE === 'tag') {
  if (process.env.GITHUB_REF_NAME !== `v${manifest.version}`) throw new Error('Tag must match package.json version');
  execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
}
console.log(`Publication inputs verified (${paths.length} tracked files)`);
