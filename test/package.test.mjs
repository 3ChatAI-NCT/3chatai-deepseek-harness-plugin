import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');

async function unpack(t) {
  const report = JSON.parse(await readFile(resolve(root, 'dist/package-manifest.json'), 'utf8'));
  assert.equal(report.name, '3chat-customer-growth');
  const packageManifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.equal(report.filename, `${packageManifest.name}-${packageManifest.version}.tgz`);
  const temporary = await mkdtemp(resolve(tmpdir(), 'threechat-public-package-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  execFileSync('tar', ['-xzf', resolve(root, 'dist', report.filename), '-C', temporary]);
  await symlink(resolve(root, 'node_modules'), resolve(temporary, 'node_modules'), 'dir');
  const base = resolve(temporary, 'package');
  const manifest = JSON.parse(await readFile(resolve(base, 'package.json'), 'utf8'));
  return { base, manifest, report };
}

test('final TGZ loads host, tools, client, and localized Skill resources', async t => {
  const { base, manifest, report } = await unpack(t);
  const exported = key => resolve(base, manifest.exports[key]);
  const files = report.files.map(file => file.path);
  assert.ok(files.includes('dist/index.js'));
  assert.ok(files.includes('dist/client.js'));
  assert.ok(files.includes('dist/locale/en.json'));
  assert.ok(files.includes('dist/locale/zh.json'));
  assert.ok(files.some(file => file.endsWith('/skills/3chat-customer-growth/SKILL.md')));
  assert.equal(manifest.scripts, undefined, 'published package has no install-time scripts');

  const host = await import(pathToFileURL(exported('.')));
  assert.equal(typeof host.apply, 'function');
  const tools = await import(pathToFileURL(exported('./tools')));
  assert.equal(typeof tools.apply, 'function');
  const localeExport = language => resolve(base, manifest.exports['./locale/*.json'].replace('*', language));
  const en = JSON.parse(await readFile(localeExport('en'), 'utf8'));
  const zh = JSON.parse(await readFile(localeExport('zh'), 'utf8'));
  assert.ok(en.title && en.description && zh.title && zh.description);

  let loaded;
  vm.runInNewContext(await readFile(exported('./client'), 'utf8'), {
    window: { __ModuleLoader__: { load: descriptor => { loaded = descriptor; } } },
  });
  assert.equal(loaded.id, manifest.name);
  const client = loaded.factory(createRequire(import.meta.url));
  let mounted;
  await client.apply({ remote: { $mount: async value => { mounted = value; } },
    effect: setup => setup(), locale: { register: () => () => {} }, inject: () => {} });
  assert.equal(mounted.package, manifest.name);
  assert.ok(mounted.descriptors.length > 0);
});

test('TGZ excludes source, tests, credentials, and development diagnostics', async t => {
  const { base, report } = await unpack(t);
  assert.ok(report.files.every(file => !/^(src|test|scripts)\//.test(file.path)));
  assert.ok(report.files.every(file => !/credentials|oauth-diagnostics|package-manifest/.test(file.path)));
  const runtime = await readFile(resolve(base, 'dist/index.js'), 'utf8');
  for (const forbidden of ['threechat-oauth-capture.json', 'OAuthDiagnostics', 'plugin.ndjson']) {
    assert.ok(!runtime.includes(forbidden), `release excludes ${forbidden}`);
  }
});


test('the published client can recover a failed locale selection without starting OAuth', async t => {
  const { base, manifest } = await unpack(t);
  let loaded;
  vm.runInNewContext(await readFile(resolve(base, manifest.exports['./client']), 'utf8'), {
    window: { __ModuleLoader__: { load: descriptor => { loaded = descriptor; } } },
  });
  const client = loaded.factory(createRequire(import.meta.url));
  const calls = [];
  const disposers = [];
  let changed;
  const runtime = client.createLocaleRuntime({
    locale: { getSnapshot: () => ({ active: 'zh-CN' }) },
    on: (event, listener) => { assert.equal(event, 'locale/change'); changed = listener; return () => { changed = undefined; }; },
    effect: setup => disposers.push(setup()),
  }, {
    selectLocale: async locale => {
      calls.push(locale);
      return calls.length === 1 ? { ok: false } : { ok: true, value: { locale, connected: false } };
    },
    connect: () => assert.fail('Retry must not start OAuth'),
  });
  t.after(() => disposers.forEach(dispose => dispose()));
  await runtime.ready();
  assert.equal(runtime.getSnapshot().ready, false);
  assert.equal(runtime.getSnapshot().error, 'rpcError');
  await runtime.retry();
  assert.equal(runtime.getSnapshot().ready, true);
  assert.equal(runtime.getSnapshot().locale, 'zh');
  changed({ active: 'en' });
  await runtime.ready();
  assert.equal(runtime.getSnapshot().locale, 'en');
  assert.deepEqual(calls, ['zh', 'zh', 'en']);
});
