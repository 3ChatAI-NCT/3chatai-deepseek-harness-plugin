import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { skillAssets } from './skill-assets.mjs';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const assets = await skillAssets('.');
const files = [
  ...['index.js', 'tools.js', 'client.js', 'locale/zh.json', 'locale/en.json', 'THIRD_PARTY_NOTICES.md']
    .map(file => `dist/${file}`),
  'cordis.patch.yml', 'README.md', 'README.en.md', 'docs/development.md', 'docs/development.en.md', 'docs/usage.md', 'docs/usage.en.md', 'LICENSE',
  ...assets,
];
// Stage outside the source tree; do not leave a second Skill or documentation tree.
const staging = await mkdtemp(resolve(tmpdir(), 'threechat-package-'));
try {
  for (const file of files) {
    const target = resolve(staging, file);
    await mkdir(dirname(target), { recursive: true });
    await cp(file, target);
  }
  delete manifest.devDependencies;
  delete manifest.scripts;
  await writeFile(resolve(staging, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  const output = execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', resolve('dist')],
    { cwd: staging, encoding: 'utf8' });
  const [report] = JSON.parse(output);
  const paths = report.files.map(file => file.path).sort();
  const expected = [...files, 'package.json'].sort();
  if (JSON.stringify(paths) !== JSON.stringify(expected)) throw new Error('Package file list differs from the release inputs');
  for (const file of assets) {
    if (!(await readFile(resolve(staging, file))).equals(await readFile(file))) throw new Error(`Stale skill asset: ${file}`);
  }
  await writeFile('dist/package-manifest.json', JSON.stringify(report, null, 2) + '\n');
  console.log(resolve('dist', report.filename));
} finally {
  await rm(staging, { recursive: true, force: true });
}
