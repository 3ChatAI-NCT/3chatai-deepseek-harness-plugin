import { randomUUID } from 'node:crypto';

/** MCP SDK OAuth provider backed by the caller's atomic credential transaction. */
export function createOAuthClientProvider(options) {
  const { redirectUrl, clientMetadata, persist, onRedirect, seed = {} } = options;
  if (typeof redirectUrl !== 'string' || redirectUrl.length === 0) {
    throw new TypeError('redirectUrl is required');
  }
  if (typeof persist !== 'function') throw new TypeError('persist is required');
  if (typeof onRedirect !== 'function') throw new TypeError('onRedirect is required');

  const state = { ...seed };

  /** Write one key through and persist the whole blob atomically. */
  async function put(key, value) {
    state[key] = value;
    await persist({ ...state });
  }

  return {
    // ---- SDK-required surface -------------------------------------------------
    get redirectUrl() {
      return redirectUrl;
    },
    get clientMetadata() {
      return clientMetadata;
    },
    async clientInformation() {
      return state.clientInformation;
    },
    async saveClientInformation(info) {
      await put('clientInformation', info);
    },
    async tokens() {
      return state.tokens;
    },
    async saveTokens(tokens) {
      const previousRefreshToken = state.tokens?.refresh_token;
      state.tokens = { ...tokens, ...(tokens.refresh_token === undefined && previousRefreshToken
        ? { refresh_token: previousRefreshToken } : {}) };
      state.tokensSavedAt = Date.now();
      await persist({ ...state });
    },
    async redirectToAuthorization(authorizationUrl) {
      await onRedirect(authorizationUrl);
    },
    async saveCodeVerifier(codeVerifier) {
      await put('codeVerifier', codeVerifier);
    },
    async codeVerifier() {
      return state.codeVerifier;
    },
    /**
     * CSRF nonce echoed back on the callback; the SDK omits `state` when this is
     * absent. A nonce is minted once per authorization attempt and cleared when
     * the callback leg consumes the provider, so a stale nonce can never be
     * replayed against a later attempt.
     */
    async state() {
      const next = state.oauthState ?? randomUUID();
      if (state.oauthState !== next) await put('oauthState', next);
      return next;
    },
    /** Consume the nonce after a successful exchange. */
    async clearState() {
      if (state.oauthState !== undefined || state.codeVerifier !== undefined) {
        delete state.oauthState;
        delete state.codeVerifier;
        await persist({ ...state });
      }
    },

    // ---- Optional surface the v2 SDK uses when present -------------------------
    /** SEP-2352: the SDK refuses the callback leg when the AS cannot be re-identified. */
    async discoveryState() {
      return state.discoveryState;
    },
    async saveDiscoveryState(next) {
      await put('discoveryState', next);
    },
    async saveAuthorizationServerUrl(issuer) {
      await put('authorizationServerUrl', issuer);
    },
    async saveResourceUrl(resource) {
      await put('resourceUrl', resource);
    },
    async invalidateCredentials(scope) {
      if (scope === 'tokens' || scope === 'all') delete state.tokens;
      if (scope === 'client' || scope === 'all') delete state.clientInformation;
      if (scope === 'all') {
        delete state.codeVerifier;
        delete state.discoveryState;
      }
      await persist({ ...state });
    },

  };
}
