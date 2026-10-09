import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const report = JSON.parse(await readFile('dist/package-manifest.json', 'utf8'));
if (report.name !== manifest.name || report.version !== manifest.version) throw new Error('Package identity mismatch');
const filename = `${manifest.name}-${manifest.version}.tgz`;
if (report.filename !== filename) throw new Error('Unexpected package filename');
await mkdir('dist/release', { recursive: true });
await copyFile(`dist/${filename}`, 'dist/release/3chat-customer-growth.tgz');
const source = { name: manifest.name, version: manifest.version, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };
await writeFile('dist/release/source.json', JSON.stringify(source, null, 2) + '\n');
const checksums = [];
for (const file of ['3chat-customer-growth.tgz', 'source.json']) {
  const digest = createHash('sha256').update(await readFile(`dist/release/${file}`)).digest('hex');
  checksums.push(`${digest}  ${file}`);
}
await writeFile('dist/release/SHA256SUMS', checksums.join('\n') + '\n');
console.log(`Release assets prepared for ${source.name}@${source.version}`);
