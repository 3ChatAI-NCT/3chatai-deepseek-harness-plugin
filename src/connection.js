import { Client, StreamableHTTPClientTransport, UnauthorizedError } from '@modelcontextprotocol/client';
import { beginAuthorization, completeAuthorization, OAUTH_SCOPE } from './oauth/flow.js';
import { createOAuthClientProvider } from './oauth/provider.js';
import { startCallbackListener, DEFAULT_LOOPBACK_PORT, DEFAULT_CALLBACK_TIMEOUT_MS } from './oauth/callback.js';
import { readGrant, toStorableGrant } from './oauth/credentials.js';
import { TOOL_NAMES, WRITE_TOOLS, prepareCatalog, validateArguments, ToolContractError } from './tool-schema.js';
import { VERSION, PACKAGE_NAME } from './protocol.js';

export const CREDENTIAL_KEY = 'threechat-mcp/oauth';
export const DEFAULT_SERVER = 'https://app.3chatai.cn/mcp';
const PLUGIN_LOCATION = '插件 → 3Chat 私域客户运营';
const SCOPE_NOTICE = '权限以组织的 3Chat 授权为准；发送前确认收件人和最终内容，上传与发送还需通过 DSH 本次执行确认。';

class ConnectionError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function publicError(error, locale = 'zh') {
  if (locale === 'en') {
    const code = error?.code;
    if (error instanceof UnauthorizedError || error?.name === 'InsufficientScopeError' || ['AUTH_REQUIRED', 'INTERACTIVE_AUTH_REQUIRED', 'invalid_grant', 'invalid_token'].includes(code)) return { code: 'AUTH_REQUIRED', message: 'Reconnect 3Chat in the plugin panel.' };
    if (error instanceof ToolContractError) return { code, message: code === 'INVALID_ARGUMENTS' ? `Check ${error.field ?? 'arguments'} against the current tool schema.` : 'The 3Chat tool catalog is unavailable or has changed.' };
    if (['CALLBACK_TIMEOUT', 'WAIT_TIMEOUT'].includes(code)) return { code: 'AUTH_TIMEOUT', message: 'Authorization timed out. Connect again.' };
    if (code === 'AUTHORIZATION_DENIED') return { code: 'AUTH_DENIED', message: 'Authorization was not approved.' };
    if (['STATE_MISMATCH', 'NO_CODE'].includes(code)) return { code: 'AUTH_CALLBACK_INVALID', message: 'Authorization could not be verified. Connect again.' };
    if (code === 'RESOURCE_MISMATCH') return { code, message: 'This authorization belongs to another 3Chat service. Connect this service separately.' };
    return { code: 'UNAVAILABLE', message: '3Chat is temporarily unavailable. Try again later.' };
  }
  const code = error?.code;
  if (error instanceof UnauthorizedError || error?.name === 'InsufficientScopeError' || ['AUTH_REQUIRED', 'INTERACTIVE_AUTH_REQUIRED', 'invalid_grant', 'invalid_token'].includes(code)) {
    return { code: 'AUTH_REQUIRED', message: '连接已失效，请在插件页重新连接 3Chat。' };
  }
  if (error instanceof ToolContractError) return { code: error.code, message: error.message };
  if (['CALLBACK_TIMEOUT', 'WAIT_TIMEOUT'].includes(code)) return { code: 'AUTH_TIMEOUT', message: '授权等待已超时，请重新点击连接。' };
  if (code === 'AUTHORIZATION_DENIED') return { code: 'AUTH_DENIED', message: '本次授权未同意，可以稍后重新连接。' };
  if (['STATE_MISMATCH', 'NO_CODE'].includes(code)) return { code: 'AUTH_CALLBACK_INVALID', message: '授权未完成，请关闭该授权页并重新连接。' };
  if (code === 'RESOURCE_MISMATCH') return { code, message: '服务地址已变化，请重新连接对应的 3Chat 服务。' };
  // Do not place upstream OAuth bodies, URLs containing codes, or token errors in UI/model output.
  return { code: 'UNAVAILABLE', message: '暂时无法连接 3Chat，请稍后重试。' };
}

function scopesOf(grant) { return typeof grant.tokens?.scope === 'string' ? grant.tokens.scope.split(/\s+/).filter(Boolean) : []; }
function hasToken(grant) { return typeof grant.tokens?.access_token === 'string' && grant.tokens.access_token.length > 0; }

/** One provider shared by native UI, Agent tools and the authorization registry. */
export class ThreeChatConnection {
  constructor({ credentials, serverUrl = DEFAULT_SERVER, requestTimeoutMs = 30000,
    callbackTimeoutMs = DEFAULT_CALLBACK_TIMEOUT_MS, loopbackPort = DEFAULT_LOOPBACK_PORT,
    logger = { warn() {} }, clock = () => Date.now(), fetchFn = fetch,
    listenerFactory = startCallbackListener, credentialKey = CREDENTIAL_KEY, locale = 'zh', productTitle = '3Chat 私域客户运营' }) {
    if (!/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(credentialKey)) throw new Error('Invalid credential key');
    this.credentials = credentials;
    this.credentialKey = credentialKey;
    this.locale = locale;
    this.productTitle = productTitle;
    this.serverUrl = String(new URL(serverUrl));
    this.requestTimeoutMs = requestTimeoutMs;
    this.callbackTimeoutMs = callbackTimeoutMs;
    this.loopbackPort = loopbackPort;
    this.logger = logger;
    this.clock = clock;
    this.fetchFn = fetchFn;
    this.listenerFactory = listenerFactory;
    this.queue = Promise.resolve();
    this.generation = 0;
    this.closed = false;
    this.attempt = undefined;
    this.fault = undefined;
    this.catalog = undefined;
    this.lastCheckedAt = undefined;
    this.needsAuthorization = false;
    this.requests = new Set();
    this.cleanups = new Set();
    this.toolListeners = new Set();
  }

  serial(operation) {
    const task = this.queue.then(() => {
      if (this.closed) throw new ConnectionError('CLOSED', 'Plugin unloaded');
      return operation();
    });
    this.queue = task.catch(() => {});
    return task;
  }

  getToolDefinitions() {
    return structuredClone(this.catalog ? [...this.catalog.tools.values()] : []);
  }

  subscribeTools(listener) {
    this.toolListeners.add(listener);
    return () => this.toolListeners.delete(listener);
  }

  publishTools(definitions) {
    for (const listener of this.toolListeners) listener(structuredClone(definitions));
  }

  resetCatalog() {
    this.catalog = undefined;
    this.publishTools([]);
  }

  async grant() { return readGrant(await this.credentials.readRecord(this.credentialKey)); }

  matchesResource(grant) {
    const resource = grant.resourceUrl ?? grant.discoveryState?.resourceMetadata?.resource;
    return resource === undefined || String(resource).replace(/\/$/, '') === this.serverUrl.replace(/\/$/, '');
  }

  // The SDK operates on an in-memory snapshot while the credential provider owns
  // one atomic read/refresh/write lease. No nested record locks or stale snapshot merges.
  async transaction(operation, generation = this.generation) {
    let value, failure;
    await this.credentials.modifyRecord(this.credentialKey, async (record) => {
      let staged = { ...readGrant(record) };
      let dirty = false;
      const persistFor = () => async (next) => { staged = { ...next }; dirty = true; };
      try { value = await operation(staged, persistFor, (next) => { staged = next; dirty = true; }); }
      catch (error) { failure = error; }
      if (this.closed || generation !== this.generation) return undefined;
      return dirty ? toStorableGrant({ ...staged, updatedAt: new Date(this.clock()).toISOString() }) : undefined;
    });
    if (failure) throw failure;
    return value;
  }

  boundedFetch(controller) {
    const sentWrites = new Set();
    return (url, init = {}) => {
      let rpc;
      try { if (typeof init.body === 'string') rpc = JSON.parse(init.body); } catch { /* OAuth forms are not RPC. */ }
      if (rpc?.method === 'tools/call' && WRITE_TOOLS.has(rpc.params?.name)) {
        // The SDK may retry after 401 or HEADER_MISMATCH. A write gets at most
        // one HTTP dispatch per explicit tool execution, even on those paths.
        if (sentWrites.has(rpc.params.name)) throw new ConnectionError('WRITE_REPLAY_BLOCKED', 'Automatic write replay blocked');
        sentWrites.add(rpc.params.name);
      }
      const request = {
        ...init,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(this.requestTimeoutMs), ...(init.signal ? [init.signal] : [])]),
      };
      return this.fetchFn(url, request);
    };
  }

  recordFailure(error) {
    this.fault = publicError(error, this.locale);
    if (this.fault.code === 'AUTH_REQUIRED' || this.fault.code === 'RESOURCE_MISMATCH') this.needsAuthorization = true;
    this.logger.warn(`threechat: ${this.fault.code}`);
  }

  async status() {
    const grant = await this.grant();
    const expiredWithoutRefresh = typeof grant.tokensSavedAt === 'number' && typeof grant.tokens?.expires_in === 'number' &&
      grant.tokensSavedAt + grant.tokens.expires_in * 1000 <= this.clock() && !grant.tokens.refresh_token;
    const wrongResource = !this.matchesResource(grant);
    const connected = hasToken(grant) && !this.needsAuthorization && !expiredWithoutRefresh && !wrongResource;
    const pending = Boolean(this.attempt);
    let status = pending ? 'connecting' : connected ? 'connected' :
      (this.needsAuthorization || expiredWithoutRefresh || wrongResource) ? 'reconnect-required' : 'disconnected';
    if (this.fault && !pending && !['AUTH_REQUIRED', 'RESOURCE_MISMATCH'].includes(this.fault.code)) status = 'unavailable';
    const messages = {
      disconnected: '连接 3Chat 后，即可在对话中开展客户分析与经确认的触达。',
      connecting: '请在浏览器完成授权，完成后这里会自动更新。',
      connected: '已连接，可以回到对话开始客户运营。',
      'reconnect-required': '需要重新登录 3Chat，已有对话不受影响。',
      unavailable: this.fault?.message ?? '暂时无法连接 3Chat，请稍后重试。',
    };
    if (this.locale === 'en') Object.assign(messages, {
      disconnected: 'Connect 3Chat to find customers and prepare outreach.',
      connecting: 'Complete authorization in your browser. This panel updates automatically.',
      connected: 'Connected. Return to chat to start working with your customers.',
      'reconnect-required': 'Reconnect this 3Chat service to continue.',
      unavailable: this.fault?.message ?? '3Chat is temporarily unavailable. Try again later.',
    });
    const host = new URL(this.serverUrl).hostname;
    return {
      status, message: messages[status], connected, pending,
      serverLabel: this.locale === 'en' ? (host === 'app.3chat.ai' ? '3Chat International' : '3Chat Test Service') : (host === 'app.3chatai.cn' ? '3Chat 国内服务' : '3Chat 测试服务'),
      grantedScopes: scopesOf(grant),
      scopeNotice: this.locale === 'en' ? 'Access follows your organization’s 3Chat permissions. Confirm recipients and content before sending.' : SCOPE_NOTICE,
      ...(this.attempt?.authorizationUrl ? { authorizationUrl: this.attempt.authorizationUrl, expiresAt: this.attempt.expiresAt } : {}),
      ...(this.lastCheckedAt ? { lastCheckedAt: this.lastCheckedAt } : {}),
      ...(this.fault ? { error: this.fault } : {}),
    };
  }

  async connect() {
    return this.serial(async () => {
      if (this.attempt) return this.status();
      const generation = ++this.generation;
      const prior = await this.status();
      if (this.closed || generation !== this.generation) return this.status();
      if (prior.connected) return prior;
      this.fault = undefined;
      this.resetCatalog();
      const controller = new AbortController();
      this.requests.add(controller);
      let attempt;
      try {
        let expectedState;
        const listener = await this.listenerFactory({
          locale: this.locale, productTitle: this.productTitle, port: this.loopbackPort, expectedState: async () => expectedState, timeoutMs: this.callbackTimeoutMs,
        });
        attempt = { listener, controller, generation, expiresAt: new Date(this.clock() + this.callbackTimeoutMs).toISOString() };
        if (this.closed || generation !== this.generation) {
          await listener.close();
          return this.status();
        }
        this.attempt = attempt;
        const begun = await this.transaction(async (seed, persistFor, replace) => {
          if (!this.matchesResource(seed)) seed = {};
          // The public client registration is only reusable for its actual callback URI.
          if (seed.clientInformation && !seed.clientInformation.redirect_uris?.includes(listener.redirectUri)) {
            delete seed.clientInformation;
          }
          delete seed.tokens;
          delete seed.codeVerifier;
          delete seed.oauthState;
          delete seed.pending;
          replace(seed);
          return beginAuthorization({ serverUrl: this.serverUrl, redirectUrl: listener.redirectUri,
            seed, persistFor, clientName: this.productTitle, scope: OAUTH_SCOPE, fetchFn: this.boundedFetch(controller) });
        }, generation);
        if (generation !== this.generation || this.closed) throw new ConnectionError('CANCELLED', 'Cancelled');
        const grant = await this.grant();
        expectedState = grant.oauthState;
        const authorizationUrl = new URL(begun.authorizationUrl);
        const expectedOrigin = new URL(grant.discoveryState?.authorizationServerUrl ?? this.serverUrl).origin;
        if (authorizationUrl.origin !== expectedOrigin || authorizationUrl.username || authorizationUrl.password) {
          throw new ConnectionError('AUTH_ORIGIN_MISMATCH', 'Unexpected authorization origin');
        }
        attempt.authorizationUrl = authorizationUrl.href;
        // Start the waiter before returning to the UI; its lifetime belongs to this service.
        attempt.task = this.finishAttempt(attempt);
        attempt.task.catch(() => {});
        return this.status();
      } catch (error) {
        if (attempt) await attempt.listener.close().catch(() => {});
        if (this.attempt === attempt) this.attempt = undefined;
        if (generation === this.generation && !this.closed) this.recordFailure(error);
        return this.status();
      } finally { this.requests.delete(controller); }
    });
  }

  async finishAttempt(attempt) {
    let cleanup;
    try {
      const callback = await attempt.listener.wait();
      cleanup = attempt.listener.close();
      this.cleanups.add(cleanup);
      cleanup.catch(() => {});
      await this.serial(async () => {
        if (attempt.generation !== this.generation || this.attempt !== attempt) return;
        this.requests.add(attempt.controller);
        await this.transaction(async (seed, persistFor) => {
          await completeAuthorization({ serverUrl: this.serverUrl, redirectUrl: attempt.listener.redirectUri,
            seed, persistFor, clientName: this.productTitle, authorizationCode: callback.code, iss: callback.iss,
            scope: OAUTH_SCOPE, fetchFn: this.boundedFetch(attempt.controller) });
        }, attempt.generation);
        this.needsAuthorization = false;
        this.fault = undefined;
        this.resetCatalog();
      });
      // Credential success is independent of network metadata discovery. End
      // the UI's authorization wait now; expose business tools only after their
      // current schemas are available. No business tool is called here.
      if (this.attempt === attempt) this.attempt = undefined;
      if (attempt.generation === this.generation && !this.closed) await this.refreshTools();
    } catch (error) {
      if (!this.closed && attempt.generation === this.generation) this.recordFailure(error);
    } finally {
      this.requests.delete(attempt.controller);
      cleanup ??= attempt.listener.close();
      this.cleanups.add(cleanup);
      // Token exchange/persistence has completed. Browser socket draining must
      // not keep the UI connecting, but remains owned by this service.
      if (this.attempt === attempt) this.attempt = undefined;
      try { await cleanup; } finally { this.cleanups.delete(cleanup); }
    }
  }

  async cancel() {
    const attempt = this.attempt;
    this.generation++;
    this.attempt = undefined;
    for (const controller of this.requests) controller.abort();
    if (attempt) { attempt.controller.abort(); await attempt.listener.close(); }
    return this.serial(async () => {
      this.generation++;
      const lateAttempt = this.attempt;
      this.attempt = undefined;
      if (lateAttempt) { lateAttempt.controller.abort(); await lateAttempt.listener.close(); }
      await this.transaction(async (seed, _persist, replace) => {
        delete seed.codeVerifier; delete seed.oauthState; delete seed.pending; replace(seed);
      });
      this.fault = undefined;
      return this.status();
    });
  }

  async disconnect() {
    this.generation++;
    const attempt = this.attempt;
    this.attempt = undefined;
    for (const controller of this.requests) controller.abort();
    if (attempt) { attempt.controller.abort(); await attempt.listener.close(); }
    return this.serial(async () => {
      this.generation++;
      const lateAttempt = this.attempt;
      this.attempt = undefined;
      if (lateAttempt) { lateAttempt.controller.abort(); await lateAttempt.listener.close(); }
      await this.credentials.deleteRecord(this.credentialKey);
      this.fault = undefined; this.resetCatalog(); this.lastCheckedAt = undefined; this.needsAuthorization = false;
      return this.status();
    });
  }

  async withSession(operation, signal) {
    const generation = this.generation;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    this.requests.add(controller);
    try {
      return await this.transaction(async (seed, persistFor) => {
        if (!hasToken(seed)) throw new ConnectionError('AUTH_REQUIRED', 'No credential');
        if (!this.matchesResource(seed)) throw new ConnectionError('RESOURCE_MISMATCH', 'Different resource');
        const redirectUrl = seed.clientInformation?.redirect_uris?.[0] ?? `http://127.0.0.1:${this.loopbackPort}/oauth/3chat-mcp-callback`;
        const provider = createOAuthClientProvider({
          redirectUrl, seed, persist: persistFor(seed),
          clientMetadata: { client_name: this.productTitle, redirect_uris: [redirectUrl],
            grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
            token_endpoint_auth_method: 'none', scope: OAUTH_SCOPE },
          onRedirect: () => { throw new ConnectionError('INTERACTIVE_AUTH_REQUIRED', 'Sign in again'); },
        });
        const transport = new StreamableHTTPClientTransport(new URL(this.serverUrl), {
          authProvider: provider, fetch: this.boundedFetch(controller), onInsufficientScope: 'throw',
        });
        const client = new Client({ name: PACKAGE_NAME, version: VERSION });
        try {
          await client.connect(transport, { timeout: this.requestTimeoutMs });
          return await operation(client, controller.signal);
        } finally { await transport.close().catch(() => {}); }
      }, generation);
    } finally {
      signal?.removeEventListener('abort', abort);
      this.requests.delete(controller);
    }
  }

  async discover(client) {
    const generation = this.generation;
    let cursor;
    const definitions = [];
    for (let page = 0; page < 20; page++) {
      const result = await client.listTools(cursor ? { cursor } : undefined);
      definitions.push(...result.tools);
      cursor = result.nextCursor;
      if (!cursor) break;
      if (page === 19) throw new ToolContractError('CAPABILITY_CHANGED', '3Chat 工具列表过长，请联系维护者。');
    }
    const tools = prepareCatalog(definitions);
    if (this.closed || generation !== this.generation) throw new ConnectionError('CANCELLED', 'Cancelled');
    this.publishTools([...tools.values()]);
    this.catalog = { tools };
  }

  async refreshTools() {
    return this.serial(async () => {
      const state = await this.status();
      if (!state.connected || state.pending) return;
      try { await this.withSession(client => this.discover(client)); }
      catch (error) { this.recordFailure(error); }
    });
  }

  async check() {
    return this.serial(async () => {
      if (this.attempt) return { ...await this.status(), checkPerformed: false };
      const grant = await this.grant();
      if (!hasToken(grant)) return { ...await this.status(), checkPerformed: false };
      try {
        await this.withSession((client) => this.discover(client));
        this.fault = undefined; this.needsAuthorization = false;
      } catch (error) { this.recordFailure(error); }
      finally { this.lastCheckedAt = new Date(this.clock()).toISOString(); }
      return { ...await this.status(), checkPerformed: true };
    });
  }

  async call(toolName, args = {}, signal, isCurrent = () => true) {
    if (!TOOL_NAMES.includes(toolName)) return {
      status: 'invalid-arguments', code: 'UNSUPPORTED_TOOL', message: '该工具不在 Skill 1.0.4 的公开能力清单中。',
    };
    return this.serial(async () => {
      if (!isCurrent()) return { status: 'connection-required', code: 'REGION_CHANGED', message: this.locale === 'en' ? 'The active connector changed. Start this request again in the selected connector.' : '连接器已切换，请在当前连接器重新发起请求。' };
      const view = await this.status();
      if (!view.connected) return { status: 'connection-required', message: view.message,
        nextAction: this.locale === 'en' ? 'Open 3Chat Customer Growth and connect your international account.' : '打开「' + PLUGIN_LOCATION + '」连接账号，再继续原任务。' };
      const write = WRITE_TOOLS.has(toolName);
      const grant = await this.grant();
      let dispatched = false;
      try {
        const result = await this.withSession(async (client, requestSignal) => {
          await this.discover(client);
          const tool = this.catalog.tools.get(toolName);
          if (!tool) return {
            status: 'tool-unavailable', code: 'TOOL_UNAVAILABLE', isError: true, tool: toolName,
            message: this.locale === 'en' ? 'This tool is not currently available for this account. Other available tools can still be used.' : '当前账号暂不可用此工具，其余可用工具仍可继续使用。',
            availableTools: [...this.catalog.tools.keys()],
            nextAction: this.locale === 'en' ? 'Use an available tool, or explain that this operation is unavailable. Do not invent a result or retry automatically.' : '使用当前可用工具，或说明此操作暂不可用；不要编造结果或自动重试。',
          };
          if (write && typeof grant.tokens?.scope === 'string' && !scopesOf(grant).includes('messages:write')) {
            this.needsAuthorization = true;
            return { status: 'connection-required', message: this.locale === 'en' ? 'The grant lacks messages:write. Reconnect and review permissions.' : '当前授权缺少 messages:write，请在插件页重新连接并审阅权限。' };
          }
          const request = validateArguments(tool, args);
          dispatched = true;
          // A single explicit call. Never replay a write after a timeout or
          // business error; preserve the server's aiAction and idempotency facts.
          return client.callTool({ name: toolName, arguments: request },
            { timeout: this.requestTimeoutMs, signal: requestSignal, toolDefinition: tool });
        }, signal);
        this.fault = undefined;
        this.lastCheckedAt = new Date(this.clock()).toISOString();
        return result;
      } catch (error) {
        const fault = publicError(error, this.locale);
        if (error instanceof ToolContractError) return {
          status: error.code === 'INVALID_ARGUMENTS' ? 'invalid-arguments' : 'query-failed',
          code: fault.code, field: error.field, message: fault.message, nextAction: fault.message,
        };
        this.recordFailure(error);
        return { status: fault.code === 'AUTH_REQUIRED' || fault.code === 'RESOURCE_MISMATCH'
            ? 'connection-required' : 'unavailable', code: fault.code, message: fault.message,
          ...(write && dispatched ? { acceptance: 'unknown',
            nextAction: this.locale === 'en' ? 'Acceptance is unknown. Keep the original parameters and idempotency key; query the original job if available.' : '未确认远端是否已受理；保留原参数与幂等键，不自动重发；若已有 job_id，只查询原任务。' }
            : { nextAction: fault.message }),
        };
      }
    });
  }

  async dispose() {
    this.closed = true; this.generation++;
    this.toolListeners.clear();
    for (const controller of this.requests) controller.abort();
    const attempt = this.attempt;
    this.attempt = undefined;
    if (attempt) { attempt.controller.abort(); await attempt.listener.close(); }
    await this.queue.catch(() => {});
    await Promise.allSettled([...this.cleanups]);
    this.catalog = undefined;
  }
}
