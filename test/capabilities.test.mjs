import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCatalog } from '../src/tool-schema.js';
import { ThreeChatConnection } from '../src/connection.js';

const search = { name: 'search_3chat_customers', inputSchema: { type: 'object', properties: {} } };

test('a bad or missing capability does not disable valid tools; duplicates are unavailable', () => {
  const invalid = { name: 'send_3chat_customer_message', inputSchema: { type: 'object', properties: { text: { type: 'unsupported-type' } } } };
  assert.deepEqual([...prepareCatalog([search, invalid, null]).keys()], [search.name]);
  assert.equal(prepareCatalog([]).size, 0);
  assert.equal(prepareCatalog([search, search]).size, 0);
});

test('removed capabilities return a recoverable result in both locales without dispatch or connection failure', async () => {
  for (const locale of ['zh', 'en']) {
    const connection = new ThreeChatConnection({ credentials: {}, locale });
    let live = [search];
    let calls = 0;
    connection.status = async () => ({ connected: true });
    connection.grant = async () => ({ tokens: { scope: 'customers:read' } });
    connection.withSession = async operation => operation({
      listTools: async () => ({ tools: live }),
      callTool: async () => { calls++; return { content: [{ type: 'text', text: 'ok' }] }; },
    });
    const missing = await connection.call('send_3chat_customer_message', {});
    assert.equal(missing.code, 'TOOL_UNAVAILABLE');
    assert.equal(missing.isError, true);
    assert.deepEqual(missing.availableTools, [search.name]);
    assert.equal(connection.needsAuthorization, false);
    assert.equal(connection.fault, undefined);
    assert.equal(calls, 0);
    await connection.call(search.name, {});
    live = [];
    assert.equal((await connection.call(search.name, {})).code, 'TOOL_UNAVAILABLE');
    assert.deepEqual(connection.getToolDefinitions(), []);
    live = [search];
    await connection.call(search.name, {});
    assert.equal(calls, 2);
    assert.deepEqual(connection.getToolDefinitions().map(tool => tool.name), [search.name]);
  }
});
