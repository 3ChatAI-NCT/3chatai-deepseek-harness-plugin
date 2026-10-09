import { auth } from '@modelcontextprotocol/client';
import { createOAuthClientProvider } from './provider.js';

/** Scope required by Skill 1.0.4; the SDK must never default to all advertised scopes. */
export const OAUTH_SCOPE = 'customers:read messages:write';

class FlowError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FlowError';
    this.code = code;
  }
}

function createProvider({ redirectUrl, persistFor, seed = {}, scope, onRedirect, clientName }) {
  return createOAuthClientProvider({
    redirectUrl, seed, persist: persistFor(seed), onRedirect,
    clientMetadata: {
      client_name: clientName,
      redirect_uris: [redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope,
      token_endpoint_auth_method: 'none',
    },
  });
}

/** Run SDK discovery and registration until a browser authorization URL is available. */
export async function beginAuthorization({ serverUrl, redirectUrl, persistFor, seed,
  scope = OAUTH_SCOPE, fetchFn, clientName = '3Chat 私域客户运营' }) {
  let authorizationUrl;
  const provider = createProvider({ redirectUrl, persistFor, seed, scope, clientName,
    onRedirect: url => { authorizationUrl = url; } });
  const result = await auth(provider, { serverUrl: new URL(serverUrl), scope, fetchFn });
  if (result === 'AUTHORIZED') return { status: 'already-authorized', authorizationUrl: undefined };
  if (result !== 'REDIRECT' || !authorizationUrl) {
    throw new FlowError('UNEXPECTED_AUTH_RESULT', `SDK auth() returned ${String(result)} without a redirect URL`);
  }
  assertRequestedScope(authorizationUrl, scope);
  return { status: 'redirect-required', authorizationUrl };
}

/** Refuse an authorization URL asking for permissions outside the declared scope. */
export function assertRequestedScope(authorizationUrl, requestedScope = OAUTH_SCOPE) {
  const requested = new URL(String(authorizationUrl)).searchParams.get('scope') ?? '';
  const asked = requested.split(/\s+/).filter(Boolean);
  const expected = new Set(requestedScope.split(/\s+/).filter(Boolean));
  const disallowed = asked.filter(scope => !expected.has(scope));
  if (disallowed.length) {
    throw new FlowError('SCOPE_ESCALATION', `Authorization requested undeclared scopes: ${disallowed.join(', ')}`);
  }
  return asked;
}

/** Exchange the validated loopback code through the SDK, then discard the nonce and verifier. */
export async function completeAuthorization({ serverUrl, redirectUrl, persistFor, seed,
  authorizationCode, iss, scope = OAUTH_SCOPE, fetchFn, clientName = '3Chat 私域客户运营' }) {
  // The listener already extracted the decoded code. OAuth codes are opaque, including punctuation.
  if (typeof authorizationCode !== 'string' || authorizationCode.length === 0) {
    throw new FlowError('NO_CODE', 'Expected a nonempty authorization code from the loopback listener');
  }
  const provider = createProvider({ redirectUrl, persistFor, seed, scope, clientName, onRedirect: () => {} });
  const result = await auth(provider, {
    serverUrl: new URL(serverUrl), authorizationCode, iss, scope, fetchFn,
  });
  if (result !== 'AUTHORIZED') {
    throw new FlowError('AUTHORIZATION_FAILED', `Token exchange did not return AUTHORIZED (got ${String(result)})`);
  }
  await provider.clearState();
}
