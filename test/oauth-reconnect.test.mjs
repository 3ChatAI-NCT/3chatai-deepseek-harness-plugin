import test from 'node:test';
import assert from 'node:assert/strict';
import { ThreeChatConnection } from '../src/connection.js';
import { completeAuthorization, OAUTH_CLIENT_NAME } from '../src/oauth/flow.js';

test('disconnect and restart reuse registration through SDK authorization and token exchange', async t => {
  const issuer = 'https://oauth.example.test';
  const serverUrl = `${issuer}/mcp`;
  const redirectUri = 'http://127.0.0.1:43110/oauth/3chat-mcp-callback';
  let record;
  const credentials = {
    readRecord: async () => structuredClone(record),
    modifyRecord: async (_key, mutate) => {
      const next = await mutate(structuredClone(record));
      if (next !== undefined) record = structuredClone(next);
      return structuredClone(record);
    },
  };
  let registrations = 0;
  let exchanges = 0;
  const metadata = {
    issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`, response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'],
  };
  const fetchFn = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const json = (body, status = 200) => Response.json(body, { status });
    if (path.includes('oauth-protected-resource')) return json({ resource: serverUrl, authorization_servers: [issuer] });
    if (path.includes('oauth-authorization-server')) return json(metadata);
    if (path === '/register') {
      registrations++;
      const body = JSON.parse(init.body);
      assert.equal(body.client_name, OAUTH_CLIENT_NAME);
      return json({ ...body, client_id: 'test-client' }, 201);
    }
    if (path === '/token') {
      exchanges++;
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('client_id'), 'test-client');
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.ok(body.get('code_verifier'));
      return json({ access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'Bearer', expires_in: 900 });
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  const listenerFactory = async () => {
    let reject;
    const pending = new Promise((_resolve, fail) => { reject = fail; });
    return { redirectUri, wait: () => pending, close: async () => reject(new Error('closed')) };
  };
  const createConnection = productTitle => new ThreeChatConnection({ credentials, serverUrl, fetchFn, listenerFactory, productTitle });
  const first = createConnection('3Chat Customer Growth');
  t.after(() => first.dispose());
  const initial = await first.connect();
  assert.equal(initial.pending, true);
  assert.equal(registrations, 1);
  const client = structuredClone(record.payload.clientInformation);
  // Simulate stored authorization, including an unfinished attempt, before disconnect.
  record.payload.tokens = { access_token: 'test-old-access', refresh_token: 'test-old-refresh' };
  record.payload.tokensSavedAt = Date.now();
  record.payload.pending = { active: true };
  assert.equal((await first.disconnect()).status, 'disconnected');
  assert.deepEqual(record.payload.clientInformation, client);
  for (const field of ['tokens', 'tokensSavedAt', 'codeVerifier', 'oauthState', 'pending']) {
    assert.equal(record.payload[field], undefined, field);
  }
  assert.equal(exchanges, 0, 'disconnect sends no token or revocation request');
  await first.dispose();

  const restarted = createConnection('3Chat 私域客户运营');
  t.after(() => restarted.dispose());
  const next = await restarted.connect();
  assert.equal(next.pending, true, next.message);
  assert.equal(new URL(next.authorizationUrl).searchParams.get('client_id'), client.client_id);
  assert.equal(registrations, 1, 'restart and reconnect must not register a new client');
  await completeAuthorization({ serverUrl, redirectUrl: redirectUri, seed: record.payload,
    persistFor: () => async payload => { record = { kind: 'grant', payload }; },
    authorizationCode: 'test-code', iss: issuer, fetchFn });
  assert.equal(exchanges, 1);
  assert.ok(record.payload.tokens.access_token);
  assert.ok(record.payload.tokens.refresh_token);
  assert.deepEqual(record.payload.clientInformation, client);
  assert.equal(registrations, 1);
  await restarted.cancel();
  await restarted.disconnect();
  assert.deepEqual(record.payload.clientInformation, client);
  assert.equal(record.payload.tokens, undefined);
});
