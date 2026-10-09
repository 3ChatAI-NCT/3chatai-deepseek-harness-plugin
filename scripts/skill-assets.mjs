import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { load } from 'js-yaml';

/** Verify the complete upstream package and the skill's lazy Markdown graph. */
export async function skillAssets(root) {
  const base = resolve(root);
  const prefix = 'references/3chat-customer-growth-1.0.4';
  const entry = `${prefix}/skills/3chat-customer-growth/SKILL.md`;
  const files = [];
  async function walk(directory) {
    for (const child of await readdir(directory, { withFileTypes: true })) {
      if (child.name === '.DS_Store') continue;
      const path = resolve(directory, child.name);
      if (child.isSymbolicLink()) throw new Error('Skill assets must not contain symlinks');
      if (child.isDirectory()) await walk(path);
      else files.push(relative(base, path).split(sep).join('/'));
    }
  }
  await walk(resolve(base, prefix));
  const expected = [
    '.codex-plugin/plugin.json', '.mcp.json', 'assets/icon.png',
    'skills/3chat-customer-growth/SKILL.md', 'skills/3chat-customer-growth/agents/openai.yaml',
    ...['conversation-search', 'customer-intelligence', 'errors-and-retries', 'group-operations', 'outbound-messaging', 'use-cases']
      .map(name => `skills/3chat-customer-growth/references/${name}.md`),
  ].map(path => `${prefix}/${path}`).sort();
  if (JSON.stringify(files.sort()) !== JSON.stringify(expected)) throw new Error('Expected the complete original 1.0.4 package');
  const plugin = JSON.parse(await readFile(resolve(base, prefix, '.codex-plugin/plugin.json'), 'utf8'));
  if (plugin.name !== '3chat-customer-growth' || plugin.version !== '1.0.4') throw new Error('Unexpected upstream plugin identity');
  const source = await readFile(resolve(base, entry), 'utf8');
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const metadata = frontmatter && load(frontmatter[1]);
  if (metadata?.name !== '3chat-customer-growth' || !metadata.description?.trim()) throw new Error('Invalid skill metadata');
  const markdown = files.filter(file => file.endsWith('.md'));
  const visited = new Set();
  async function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const text = await readFile(resolve(base, file), 'utf8');
    for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^https?:/.test(target)) continue;
      const linked = relative(base, resolve(base, dirname(file), target)).split(sep).join('/');
      if (!markdown.includes(linked)) throw new Error(`Broken or external skill reference: ${file} -> ${target}`);
      await visit(linked);
    }
  }
  await visit(entry);
  if (visited.size !== markdown.length) throw new Error('Every skill reference must be reachable from SKILL.md');
  return files;
}
