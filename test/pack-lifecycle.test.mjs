import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

test('standard npm pack builds every runtime entry from clean source', async t => {
  const root = resolve(import.meta.dirname, '..');
  const temporary = await mkdtemp(resolve(tmpdir(), 'threechat-native-pack-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of files) {
    const destination = resolve(temporary, file);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(root, file), destination);
  }
  await symlink(resolve(root, 'node_modules'), resolve(temporary, 'node_modules'), 'dir');
  const report = JSON.parse(execFileSync('npm', ['pack', '--json'], { cwd: temporary, encoding: 'utf8' }))[0];
  const packed = new Set(report.files.map(file => file.path));
  for (const file of ['dist/index.js', 'dist/tools.js', 'dist/client.js', 'dist/locale/en.json', 'dist/locale/zh.json']) {
    assert.ok(packed.has(file), `standard package includes ${file}`);
  }
});
