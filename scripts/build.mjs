import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { skillAssets } from './skill-assets.mjs';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const destination = resolve('dist');
await skillAssets('.');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const external = ['@deepseek-ai/cordis', '@deepseek-ai/schemastery', '@deepseek-ai/dsh-typert-protocol'];
const hostBuild = await build({
  entryPoints: { index: 'src/index.js', tools: 'src/tools.js' },
  outdir: destination, bundle: true, platform: 'node', target: 'node22', format: 'esm',
  external, sourcemap: false, metafile: true,
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
const client = await build({ entryPoints: ['src/ui/panel.jsx'], bundle: true, format: 'cjs',
  platform: 'browser', target: 'es2022', external: ['react'], minify: true, write: false, metafile: true });
const source = `window.__ModuleLoader__.load({id:${JSON.stringify(manifest.name)},factory(require){var module={exports:{}};var exports=module.exports;\n${client.outputFiles[0].text}\nreturn module.exports;}});\n`;
await writeFile(`${destination}/client.js`, source);
await cp('src/ui/locale', `${destination}/locale`, { recursive: true });
const dependencies = new Map();
for (const input of [...Object.keys(hostBuild.metafile.inputs), ...Object.keys(client.metafile.inputs)]) {
  if (!input.includes('node_modules/')) continue;
  let directory = dirname(resolve(input));
  while (directory.includes('node_modules')) {
    try {
      const info = JSON.parse(await readFile(`${directory}/package.json`, 'utf8'));
      if (info.name && info.version) { dependencies.set(directory, info); break; }
    } catch { /* walk to package root */ }
    directory = dirname(directory);
  }
}
const notices = ['# Bundled third-party software\n'];
for (const [directory, info] of dependencies) {
  notices.push(`## ${info.name}@${info.version} (${info.license ?? 'see license'})\n`);
  for (const file of (await readdir(directory)).filter((name) => /^(licen[cs]e|notice)(\.|$)/i.test(name))) {
    notices.push(await readFile(`${directory}/${file}`, 'utf8'));
  }
}
await writeFile(`${destination}/THIRD_PARTY_NOTICES.md`, notices.join('\n\n'));
// Keep npm pack --json stdout parseable when this runs as its prepack hook.
console.error(`Built ${manifest.name}@${manifest.version} at ${destination}`);
