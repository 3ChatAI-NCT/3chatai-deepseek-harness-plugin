/**
 * Loopback OAuth callback listener for the 3Chat MCP plugin.
 *
 * Binds one ephemeral HTTP listener on 127.0.0.1 that receives the authorization
 * response, validates `state` (and surfaces `iss` for the SDK's own RFC 9207 check),
 * and hands the authorization code to the caller in memory. The code never enters a
 * chat message.
 *
 * No protocol work happens here: registration, PKCE, the token exchange and issuer
 * validation stay in the MCP SDK. This module only moves the callback from the
 * browser into that flow.
 *
 * Loopback is the RFC 8252 §7.3 redirect for a native client, and it is the only
 * scheme the SDK's own transport rules treat as safe without TLS.
 */

import { createServer } from 'node:http';

/** Default fixed port. Fixed so a re-registration reuses one redirect_uri. */
export const DEFAULT_LOOPBACK_PORT = 43110;

/** Path of the callback route; part of the registered redirect_uri. */
const LOOPBACK_CALLBACK_PATH = '/oauth/3chat-mcp-callback';

/** How long a listener stays open waiting for one browser callback. */
export const DEFAULT_CALLBACK_TIMEOUT_MS = 10 * 60 * 1000;

// Cleanup is independent of token exchange; allow the tiny callback page to flush.
const CALLBACK_CLEANUP_GRACE_MS = 1000;

class CallbackError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CallbackError';
    this.code = code;
  }
}

/**
 * Build the redirect_uri for a bound listener.
 *
 * The authority is always numeric loopback, never a hostname and never the resource
 * server's origin: a redirect_uri on the service's own domain is not a callback this
 * process can receive.
 */
function redirectUriFor(port, path = LOOPBACK_CALLBACK_PATH) {
  return `http://127.0.0.1:${port}${path}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function page(title, body, locale, productTitle) {
  if (locale === 'en') {
    title = ({ '已收到授权': 'Authorization received', '未完成授权': 'Authorization not completed' })[title] ?? title;
    body = ({ '请返回 DeepSeek Harness，连接结果将自动更新。您可以关闭此页面，无需复制任何内容。': 'Return to DeepSeek Harness. Connection status will update automatically. You may close this page.', '您尚未同意本次授权，可以返回 DSH 后重新连接。': 'Access was not approved. Return to DSH to connect again.' })[body] ?? body;
  }
  return `<!doctype html><html lang="${locale === 'en' ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(productTitle)}</title></head>
<body style="font:16px/1.7 system-ui,-apple-system,Segoe UI,sans-serif;margin:0;padding:4rem 1.5rem;color:#172233;background:#f6f8fb">
<main style="max-width:480px;margin:auto;background:white;padding:2rem;border-radius:16px"><p style="color:#64748b">${escapeHtml(productTitle)}</p>
<h1 style="font-size:1.35rem;margin:0 0 .75rem">${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p></main><script>history.replaceState(null,'',location.pathname)</script></body></html>`;
}

function respond(res, status, title, message, locale, productTitle) {
  const body = page(title, message, locale, productTitle);
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'close',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Bind a one-shot loopback callback listener.
 *
 * @param {object} options
 * @param {number} [options.port] Preferred port; falls back to an ephemeral port when taken.
 * @param {string} [options.path] Callback path.
 * @param {() => Promise<string | undefined>} options.expectedState Returns the state the
 *   listener must see echoed back. Rejecting or returning a different value refuses the callback.
 * @param {number} [options.timeoutMs] How long to wait for the callback.
 * @returns {Promise<{ redirectUri: string, port: number, address: string, wait: (opts?: object) => Promise<{code: string, iss?: string, state?: string}>, close: () => Promise<void>, settled: Promise<unknown>, closed: boolean }>}
 */
export async function startCallbackListener({
  port = DEFAULT_LOOPBACK_PORT,
  path = LOOPBACK_CALLBACK_PATH,
  expectedState,
  locale = 'zh', productTitle = '3Chat 私域客户运营',
  timeoutMs = DEFAULT_CALLBACK_TIMEOUT_MS,
} = {}) {
  const reply = (res, status, title, message) => respond(res, status, title, message, locale, productTitle);
  if (typeof expectedState !== 'function') throw new TypeError('expectedState is required');

  let settle;
  const outcome = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  // The waiter owns the outcome; a caller that never awaits it must not create an
  // unhandled rejection.
  outcome.catch(() => {});

  let closed = false;
  let closePromise;
  const sockets = new Set();
  const activeSockets = new Set();
  let settled = false;
  let timer;

  const settleOnce = (fn, value) => {
    if (settled) return;
    settled = true;
    fn(value);
  };

  const server = createServer(async (req, res) => {
    activeSockets.add(req.socket);
    res.once('finish', () => {
      activeSockets.delete(req.socket);
      if (closed) req.socket.end();
    });
    let url;
    try {
      url = new URL(req.url, 'http://127.0.0.1');
    } catch {
      reply(res, 400, 'Bad request', 'The callback URL could not be parsed.');
      return;
    }

    if (url.pathname !== path) {
      reply(res, 404, 'Nothing here', 'This is a temporary OAuth callback listener.');
      return;
    }
    if (req.method !== 'GET') {
      reply(res, 405, 'Method not allowed', 'The authorization response must arrive as a GET.');
      return;
    }

    const params = url.searchParams;
    const error = params.get('error');

    // CSRF first: refuse a response that does not echo the state this attempt issued,
    // before reading anything else out of it.
    let expected;
    try {
      expected = await expectedState();
    } catch (cause) {
      reply(res, 500, 'Cannot verify this callback', 'The pending authorization state could not be read.');
      settleOnce(settle.reject, new CallbackError('STATE_UNAVAILABLE', `cannot read the pending state: ${String(cause)}`));
      return;
    }
    const state = params.get('state') ?? undefined;
    if (expected === undefined || state !== expected) {
      settleOnce(
        settle.reject,
        new CallbackError(
          'STATE_MISMATCH',
          'the callback did not echo the state issued for this attempt; refused without reading the code',
        ),
      );
      reply(res, 400, 'Callback refused', 'The state parameter did not match this authorization attempt.');
      return;
    }

    if (error) {
      settleOnce(
        settle.reject,
        new CallbackError('AUTHORIZATION_DENIED', `authorization server returned ${error}: ${params.get('error_description') ?? ''}`.trim()),
      );
      reply(res, 400, '未完成授权', '您尚未同意本次授权，可以返回 DSH 后重新连接。');
      return;
    }

    const code = params.get('code');
    if (!code) {
      settleOnce(settle.reject, new CallbackError('NO_CODE', 'the callback contained no authorization code'));
      reply(res, 400, 'Callback refused', 'No authorization code was present.');
      return;
    }

    // Only after state and error checks: hand the code, and the RFC 9207 issuer, to
    // the flow. The SDK validates `iss` against freshly discovered metadata.
    const iss = params.get('iss') ?? undefined;
    settleOnce(settle.resolve, { code, iss, state });
    reply(
      res,
      200,
      '已收到授权',
      '请返回 DeepSeek Harness，连接结果将自动更新。您可以关闭此页面，无需复制任何内容。',
    );
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => { sockets.delete(socket); activeSockets.delete(socket); });
    if (closed) socket.destroy();
  });

  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  /** Bind, retrying once on an ephemeral port when the preferred one is taken. */
  const listen = (bindPort) =>
    new Promise((resolve, reject) => {
      const onError = (error) => {
        server.removeListener('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve(server.address());
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(bindPort, '127.0.0.1');
    });

  let address;
  try {
    address = await listen(port);
  } catch (error) {
    if (error?.code !== 'EADDRINUSE') throw error;
    // A dynamic registration binds one port into its redirect_uri, so a taken port
    // means a fresh registration on the ephemeral port instead.
    address = await listen(0);
  }

  const boundPort = typeof address === 'object' && address !== null ? address.port : port;


  /**
   * Release the port. A waiter that is still pending is failed with CLOSED rather than
   * left unresolved: unloading the plugin must end the in-flight tool call, not hang it
   * until its timeout.
   */
  const close = (reason) => {
    if (closePromise) return closePromise;
    closed = true;
    if (timer !== undefined) clearTimeout(timer);
    settleOnce(settle.reject, new CallbackError('CLOSED', reason ?? 'the callback listener was closed before a callback arrived'));
    closePromise = new Promise((resolve) => {
      // Chrome may open an extra TCP socket without sending a request. Node's
      // server.close() leaves that socket alive, blocking the token exchange.
      // Let active callback responses flush, but bound teardown of every socket.
      const force = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, CALLBACK_CLEANUP_GRACE_MS);
      server.close(() => {
        clearTimeout(force);
        resolve();
      });
      for (const socket of sockets) if (!activeSockets.has(socket)) socket.destroy();
    });
    return closePromise;
  };

  const wait = async ({ timeoutMs: waitMs = timeoutMs } = {}) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      settleOnce(settle.reject, new CallbackError('CALLBACK_TIMEOUT', `no callback arrived within ${waitMs} ms`));
    }, waitMs);
    try {
      return await outcome;
    } finally {
      // Stop accepting callbacks now, but return the OAuth result immediately.
      // The service owns and awaits close() during finalization or disposal.
      void close();
    }
  };

  return {
    redirectUri: redirectUriFor(boundPort, path),
    port: boundPort,
    address: '127.0.0.1',
    wait,
    close,
    settled: outcome,
    get closed() {
      return closed;
    },
  };
}
