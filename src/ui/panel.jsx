import * as React from 'react';
import { publicDescriptors, PACKAGE_NAME } from '../protocol.js';
import en from './locale/en.json';
import zh from './locale/zh.json';

export const inject = ['slots', 'locale', 'remote'];

const initialState = { status: 'disconnected', message: '', serverLabel: '', connected: false, pending: false, grantedScopes: [] };
const styles = `
.three-chat-panel{color:var(--dsw-alias-label-primary);font:inherit;max-width:680px;padding:24px;box-sizing:border-box;line-height:1.6}
.three-chat-panel *{box-sizing:border-box}
.three-chat-panel h2{font-size:20px;line-height:1.4;margin:0 0 8px;font-weight:600}
.three-chat-panel h3{font-size:14px;margin:0 0 8px;font-weight:600}
.three-chat-panel p{margin:0 0 12px}
.three-chat-panel .tc-muted{color:var(--dsw-alias-label-caption);font-size:13px}
.three-chat-panel .tc-card{background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:18px;margin-top:20px}
.three-chat-panel .tc-status-row,.three-chat-panel .tc-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.three-chat-panel .tc-status-row{margin-bottom:12px}
.three-chat-panel .tc-chip{display:inline-flex;align-items:center;gap:7px;font-size:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:99px;padding:2px 9px;font-weight:500}
.three-chat-panel .tc-dot{width:6px;height:6px;background:currentColor;border-radius:50%}
.three-chat-panel .tc-connected{color:var(--dsw-alias-state-business-primary)}
.three-chat-panel .tc-server{font-size:13px;overflow-wrap:anywhere}
.three-chat-panel button,.three-chat-panel .tc-button{font:inherit;font-size:13px;font-weight:500;line-height:1.5;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:7px 12px;cursor:pointer;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);text-decoration:none;display:inline-flex;align-items:center;justify-content:center;min-height:36px}
.three-chat-panel button:hover,.three-chat-panel .tc-button:hover{filter:brightness(.95)}
.three-chat-panel button:focus-visible,.three-chat-panel a:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}
.three-chat-panel button:disabled{cursor:wait;opacity:.55}
.three-chat-panel .tc-primary{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}
.three-chat-panel .tc-example+.tc-example{margin-top:18px}
.three-chat-panel .tc-prompt{background:var(--dsw-alias-bg-base);padding:12px;border-radius:7px;overflow-wrap:anywhere;font-size:14px}
.three-chat-panel .tc-notice{margin-top:14px;margin-bottom:0;font-size:13px;color:var(--dsw-alias-label-caption)}
.three-chat-panel .tc-error{border-left:3px solid var(--dsw-alias-state-business-primary);padding-left:10px;margin-top:14px;font-size:13px;overflow-wrap:anywhere}
@media(max-width:480px){.three-chat-panel{padding:16px}.three-chat-panel .tc-card{padding:14px}}
`;

export function safeAuthorizationUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export const normalizeLocale = value => /^zh(?:[-_]|$)/i.test(value || '') ? 'zh' : 'en';

// Lives with the plugin context, so language changes also apply with the panel closed.
export function createLocaleRuntime(ctx, api) {
  let disposed = false, revision = 0;
  let snapshot = { locale: normalizeLocale(ctx.locale.getSnapshot().active), ready: false, value: null, error: '' };
  const listeners = new Set();
  const publish = next => { snapshot = next; for (const listener of listeners) listener(); };
  let selection;
  const select = locale => {
    if (disposed) return Promise.resolve();
    const current = ++revision;
    publish({ locale, ready: false, value: null, error: '' });
    selection = Promise.resolve().then(() => {
      if (disposed || current !== revision) return;
      return api.selectLocale(locale);
    }).then(result => {
      if (disposed || current !== revision) return;
      publish({ locale, ready: Boolean(result?.ok && result.value), value: result?.value || null, error: result?.ok ? '' : 'rpcError' });
    }).catch(() => { if (!disposed && current === revision) publish({ locale, ready: false, value: null, error: 'rpcError' }); });
    return selection;
  };
  const off = ctx.on('locale/change', next => {
    const locale = normalizeLocale(next.active);
    if (locale !== snapshot.locale) void select(locale);
  });
  const dispose = () => { disposed = true; revision++; listeners.clear(); if (typeof off === 'function') off(); };
  ctx.effect(() => dispose);
  void select(snapshot.locale);
  return { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, ready: () => selection, isDisposed: () => disposed };
}

const defaultLocaleRuntime = { getSnapshot: () => defaultLocaleSnapshot, subscribe: () => () => {} };
const defaultLocaleSnapshot = { locale: 'zh', ready: true, value: null, error: '' };

export function createPanel(api, localeRuntime = defaultLocaleRuntime) {
  return function ThreeChatPanel({ t, view, initial = initialState }) {
    const localeSeat = React.useSyncExternalStore(localeRuntime.subscribe, localeRuntime.getSnapshot, localeRuntime.getSnapshot);
    const locale = localeSeat.locale;
    const tr = (key) => {
      const translated = typeof t === 'function' ? t(key) : undefined;
      return typeof translated === 'string' && translated !== key ? translated : (locale === 'zh' ? zh : en)[key] || key;
    };
    const [state, setState] = React.useState(localeSeat.value || initial);
    const [busy, setBusy] = React.useState('');
    const [error, setError] = React.useState('');
    const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);
    const [copyStatus, setCopyStatus] = React.useState({});
    const mounted = React.useRef(false);
    const generation = React.useRef(0);
    const running = React.useRef(false);
    const polling = React.useRef(false);
    const activeLocale = React.useRef(locale);
    activeLocale.current = locale;
    const rpc = React.useCallback(async (method, quiet = false) => {
      const seat = localeRuntime.getSnapshot();
      if (!mounted.current || !seat.ready || seat.locale !== activeLocale.current) return;
      const actionLocale = seat.locale;
      if (quiet ? running.current || polling.current : running.current) return;
      const pollToken = {};
      if (quiet) polling.current = pollToken;
      else { running.current = true; if (mounted.current) { setBusy(method); setError(''); } }
      const current = quiet ? generation.current : ++generation.current;
      try {
        const result = await api[method](actionLocale);
        if (!mounted.current || current !== generation.current || actionLocale !== activeLocale.current || actionLocale !== localeRuntime.getSnapshot().locale) return;
        if (!result?.ok || !result.value) {
          setError(result?.error?.message || 'rpcError');
          return;
        }
        if (result.value.locale && result.value.locale !== actionLocale) return;
        setState(result.value);
        setError('');
        if (method === 'disconnect') setConfirmDisconnect(false);
      } catch {
        if (mounted.current && current === generation.current && actionLocale === localeRuntime.getSnapshot().locale) setError('rpcError');
      } finally {
        if (quiet && polling.current === pollToken) polling.current = false;
        else if (current === generation.current) { running.current = false; if (mounted.current) setBusy(''); }
      }
    }, []);

    React.useEffect(() => {
      mounted.current = true;
      const startup = setTimeout(() => void rpc('status'), 0);
      return () => { clearTimeout(startup); mounted.current = false; generation.current += 1; };
    }, [rpc]);

    React.useEffect(() => {
      generation.current++;
      running.current = false; polling.current = false;
      setBusy(''); setError(localeSeat.error); setConfirmDisconnect(false); setCopyStatus({});
      setState(localeSeat.value || (localeRuntime === defaultLocaleRuntime ? initial : { ...initialState, locale }));
    }, [localeSeat]);

    React.useEffect(() => {
      if (!state.pending || confirmDisconnect || typeof document === 'undefined') return;
      const check = () => { if (document.visibilityState === 'visible') void rpc('status', true); };
      const timer = setInterval(check, 1800);
      document.addEventListener('visibilitychange', check);
      return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check); };
    }, [state.pending, confirmDisconnect, rpc]);

    const copyPrompt = async key => {
      const current = generation.current;
      const text = tr(key);
      try {
        await navigator.clipboard.writeText(text);
        if (mounted.current && current === generation.current && locale === localeRuntime.getSnapshot().locale) setCopyStatus(previous => ({ ...previous, [key]: 'copied' }));
      } catch { if (mounted.current && current === generation.current && locale === localeRuntime.getSnapshot().locale) setCopyStatus(previous => ({ ...previous, [key]: 'copyFailed' })); }
    };
    const matching = localeSeat.ready && (!state.locale || state.locale === locale);
    const shown = matching ? state : { ...initialState, status: 'connecting' };
    const disabled = Boolean(busy) || !matching;
    const authorizationUrl = safeAuthorizationUrl(shown.authorizationUrl);
    const statusKey = ['disconnected', 'connecting', 'connected', 'reconnect-required', 'unavailable'].includes(shown.status) ? shown.status : 'unavailable';
    const displayedError = error || shown.error?.message;
    return <section className="three-chat-panel" aria-label={tr('title')}>
      <style>{styles}</style>
      <h2>{tr('title')}</h2>
      <p className="tc-muted">{tr('valueProposition')}</p>
      <div className="tc-card" aria-busy={disabled}>
        <div className="tc-status-row">
          <span className={`tc-chip ${shown.connected ? 'tc-connected' : ''}`} role="status"><span className="tc-dot" aria-hidden="true" />{tr(statusKey)}</span>
          {shown.serverLabel && <span className="tc-server">{shown.serverLabel}</span>}
        </div>
        {(shown.message || !shown.pending) && <p>{shown.message || tr(shown.connected ? 'connectedHint' : 'disconnectedHint')}</p>}
        {shown.pending ? <>
          <p className="tc-muted">{tr('pendingHint')}</p>
          <div className="tc-actions">
            {authorizationUrl && <a className="tc-button tc-primary" href={authorizationUrl} target="_blank" rel="noopener noreferrer">{tr('openAuthorization')}</a>}
            <button disabled={disabled} onClick={() => rpc('check')}>{tr('check')}</button>
            <button disabled={disabled} onClick={() => rpc('cancel')}>{tr('cancel')}</button>
          </div>
          {!authorizationUrl && <p className="tc-notice">{tr('missingAuthorization')}</p>}
        </> : shown.connected ? <>
          {confirmDisconnect ? <div>
            <p>{tr('disconnectExplanation')}</p>
            <div className="tc-actions">
              <button disabled={disabled} onClick={() => rpc('disconnect')}>{tr('confirmDisconnect')}</button>
              <button disabled={disabled} onClick={() => setConfirmDisconnect(false)}>{tr('keepConnection')}</button>
            </div>
          </div> : <div className="tc-actions">
            <button disabled={disabled} onClick={() => rpc('check')}>{tr('checkConnection')}</button>
            <button disabled={disabled} onClick={() => setConfirmDisconnect(true)}>{tr('disconnect')}</button>
          </div>}
        </> : <div className="tc-actions">
          <button className="tc-primary" disabled={disabled} onClick={() => rpc('connect')}>{tr(shown.status === 'reconnect-required' ? 'reconnect' : 'connect')}</button>
          <button disabled={disabled} onClick={() => rpc('check')}>{tr('retry')}</button>
        </div>}
        {displayedError && <p className="tc-error" role="alert">{displayedError === 'rpcError' ? tr('rpcError') : displayedError}</p>}
        <p className="tc-notice">{shown.scopeNotice || tr('scopeNotice')}</p>
      </div>
      {shown.connected && <div className="tc-card">
        <h3>{tr('tryHeading')}</h3>
        <p className="tc-muted">{tr('tryHint')}</p>
        {['examplePrompt1', 'examplePrompt2', 'examplePrompt3'].map(key => <div key={key} className="tc-example">
          <p className="tc-prompt">{tr(key)}</p>
          <div className="tc-actions"><button onClick={() => copyPrompt(key)}>{tr('copyPrompt')}</button><span className="tc-muted" role="status">{copyStatus[key] && tr(copyStatus[key])}</span></div>
        </div>)}
      </div>}
    </section>;
  };
}

export async function apply(ctx) {
  await ctx.remote.$mount({ package: PACKAGE_NAME, descriptors: publicDescriptors });
  ctx.effect(() => ctx.locale.register('threeChat', { en, zh }));
  // $mount creates this service. Waiting for it belongs after that declaration,
  // not in the static inject list (which would deadlock its own provider).
  ctx.inject(['remote.threeChat'], async child => {
    const runtime = createLocaleRuntime(child, child.remote.threeChat);
    await runtime.ready();
    if (runtime.isDisposed()) return;
    const Panel = createPanel(child.remote.threeChat, runtime);
    child.slots.inject('plugins.bundle.config', () => child.slots.register({
      name: 'plugins.bundle.config', key: PACKAGE_NAME, locale: 'threeChat',
    }, Panel));
  });
}
