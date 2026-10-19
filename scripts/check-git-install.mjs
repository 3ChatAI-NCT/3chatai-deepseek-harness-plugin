import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Test the committed Git package, not the working tree or a Release tarball.
const root = resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(resolve(tmpdir(), 'threechat-git-install-'));
const spec = process.env.GIT_INSTALL_SPEC ?? `git+file://${root}`;
const pnpm = process.env.PNPM_EXECUTABLE ?? 'pnpm';
try {
  for (const mode of ['cold', 'warm']) {
    const profile = resolve(temporary, mode);
    await mkdir(profile);
    await writeFile(resolve(profile, 'package.json'), JSON.stringify({ name: `threechat-${mode}-acceptance`, private: true }));
    const output = execFileSync(pnpm, ['add', spec, '--store-dir', resolve(temporary, 'store'), '--reporter', 'append-only'],
      { cwd: profile, encoding: 'utf8', env: { ...process.env, CI: 'true' }, timeout: 180000 });
    assert.doesNotMatch(output, /Ignored build scripts|npm-run-prepack|npm-install\$/);
    const base = resolve(profile, 'node_modules/3chat-customer-growth');
    const manifest = JSON.parse(await readFile(resolve(base, 'package.json'), 'utf8'));
    for (const key of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack']) assert.ok(!manifest.scripts?.[key], key);
    for (const file of ['dist/index.js', 'dist/tools.js', 'dist/client.js', 'dist/locale/en.json', 'dist/locale/zh.json', 'dist/THIRD_PARTY_NOTICES.md',
      'cordis.patch.yml', 'references/3chat-customer-growth-1.0.4/skills/3chat-customer-growth/SKILL.md']) await access(resolve(base, file));
    assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
    assert.match(await readFile(resolve(profile, 'pnpm-lock.yaml'), 'utf8'), /3chat-customer-growth/);
    console.log(`${mode} Git installation passed: ${manifest.name}@${manifest.version}`);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
