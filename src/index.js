import { fileURLToPath } from 'node:url';
import z from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { ThreeChatConnection } from './connection.js';
import { PACKAGE_NAME, publicDescriptors } from './protocol.js';
import { REGIONS, regionForLocale } from './regions.js';

export const name = 'threechat-connection';
export const inject = ['credentials', 'authorization', 'typert'];
export const Config = z.object({
  requestTimeoutMs: z.number().min(1000).max(60000).default(30000),
  callbackTimeoutMs: z.number().min(30000).max(900000).default(600000),
  loopbackPort: z.number().step(1).min(0).max(65535).default(43110),
});

/** Two fixed providers. Locale changes select a provider, never mutate its resource. */
export class ThreeChatService extends TypertRemoteService {
  static inject = ['credentials', 'authorization'];
  constructor(ctx, config = {}) {
    super(ctx, 'threeChat');
    this.skillRoot = fileURLToPath(new URL('../references/3chat-customer-growth-1.0.4/skills/', import.meta.url));
    this.activeRegion = undefined;
    this.selectionGeneration = 0;
    this.clientManaged = false;
    this.closed = false;
    this.listeners = new Set();
    this.jobs = new Map();
    this.connections = Object.fromEntries(Object.values(REGIONS).map(region => [region.id,
      new ThreeChatConnection({ ...config, credentials: ctx.credentials, logger: ctx.logger,
        serverUrl: region.serverUrl, credentialKey: region.credentialKey,
        locale: region.locale, productTitle: region.title })]));
    for (const region of Object.values(REGIONS)) {
      const connection = this.connections[region.id];
      const unsubscribe = connection.subscribeTools(definitions => {
        if (!this.closed && this.activeRegion === region.id) this.publish(definitions);
      });
      ctx.effect(() => unsubscribe);
      ctx.authorization.registerFlow({
        key: region.credentialKey, label: region.title,
        methods: [{ id: 'oauth', label: region.locale === 'zh' ? '连接 3Chat' : 'Connect 3Chat' }],
        run: async session => {
          const view = await connection.connect();
          if (!view.authorizationUrl) {
            if (!view.connected) throw new Error(view.message);
            await ctx.credentials.modifyRecord(region.credentialKey, async record => record);
            return;
          }
          session.notify({ message: region.locale === 'zh' ? '请在浏览器完成 3Chat 授权。' : 'Complete 3Chat authorization in your browser.', url: view.authorizationUrl });
          const task = connection.attempt?.task;
          const cancel = () => { void connection.cancel(); };
          session.signal.addEventListener('abort', cancel, { once: true });
          try {
            if (session.signal.aborted) { await connection.cancel(); return; }
            await task;
            const ready = await connection.status();
            if (!ready.connected) throw new Error(ready.message);
          } finally { session.signal.removeEventListener('abort', cancel); }
        },
      });
    }
    // Explicit profile preference supports headless operation. The Client's resolved
    // locale takes precedence, since absent preferences can depend on OS/browser language.
    ctx.inject(['settings'], child => {
      let revision = 0;
      const update = async () => {
        const current = ++revision;
        const entries = await child.settings.describe({ redactSecrets: true });
        if (this.closed || this.clientManaged || current !== revision) return;
        const preference = entries.find(entry => entry.ns === 'locale')?.value?.preference;
        if (typeof preference === 'string') await this.activateLocale(preference);
      };
      child.on('settings/document-updated', ns => { if (ns === 'locale') void update().catch(error => ctx.logger.warn(error.message)); });
      child.effect(() => () => { revision++; });
      void update().catch(error => ctx.logger.warn(error.message));
    });
    ctx.effect(() => async () => {
      this.closed = true; this.selectionGeneration++;
      this.listeners.clear();
      await Promise.all(Object.values(this.connections).map(connection => connection.dispose()));
    });
  }
  publish(definitions) { for (const listener of this.listeners) listener(structuredClone(definitions)); }
  getToolDefinitions() { return this.activeRegion ? this.connections[this.activeRegion].getToolDefinitions() : []; }
  subscribeTools(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async selectLocale(locale) {
    if (locale !== 'zh' && locale !== 'en') throw new TypeError('Unsupported locale');
    this.clientManaged = true;
    return this.activateLocale(locale);
  }
  async activateLocale(locale) {
    if (this.closed) throw new Error('Plugin unloaded');
    const region = regionForLocale(locale);
    const changed = region.id !== this.activeRegion;
    if (changed) {
      this.activeRegion = region.id;
      this.selectionGeneration++;
      this.publish([]);
    }
    const generation = this.selectionGeneration;
    const connection = this.connections[region.id];
    if (changed || !connection.catalog) await connection.refreshTools();
    if (!this.closed && generation === this.selectionGeneration) this.publish(connection.getToolDefinitions());
    return { ...await connection.status(), region: region.id, locale: region.locale };
  }
  selected(locale) {
    const region = locale === undefined ? this.activeRegion : regionForLocale(locale).id;
    if (!region || region !== this.activeRegion) throw new Error('REGION_CHANGED: select the current DSH language before operating this connector');
    return { region, connection: this.connections[region] };
  }
  async operation(method, locale) {
    const { region, connection } = this.selected(locale);
    const value = await connection[method]();
    return { ...value, region, locale: REGIONS[region].locale };
  }
  status(locale) {
    if (!this.activeRegion) return Promise.resolve({ status: 'disconnected', connected: false, pending: false,
      message: 'Open the plugin panel to select the connector for your DSH language.', serverLabel: '', grantedScopes: [] });
    return this.operation('status', locale);
  }
  connect(locale) { return this.operation('connect', locale); }
  cancel(locale) { return this.operation('cancel', locale); }
  disconnect(locale) { return this.operation('disconnect', locale); }
  check(locale) { return this.operation('check', locale); }
  async refreshTools() { if (this.activeRegion) await this.connections[this.activeRegion].refreshTools(); }
  capturedConnector() {
    const region = this.activeRegion;
    const generation = this.selectionGeneration;
    return { region, generation, locale: region ? REGIONS[region].locale : 'en',
      title: region ? REGIONS[region].title : '',
      call: (tool, args, signal) => this.call(tool, args, signal, region, generation) };
  }
  async call(tool, args, signal, expectedRegion = this.activeRegion, expectedGeneration = this.selectionGeneration) {
    const isCurrent = () => !this.closed && expectedRegion === this.activeRegion && expectedGeneration === this.selectionGeneration;
    if (!expectedRegion || !isCurrent()) return { status: 'connection-required', code: 'REGION_CHANGED',
      message: 'The active connector changed. Restart this request in the selected connector.' };
    const owners = tool === 'get_3chat_batch_send_status' ? this.jobs.get(args?.job_id) : undefined;
    if (owners && !owners.has(expectedRegion)) return { status: 'invalid-arguments', code: 'JOB_REGION_MISMATCH',
      message: 'This batch belongs to the other connector. Switch back to its language to track it.' };
    const result = await this.connections[expectedRegion].call(tool, args, signal, isCurrent);
    if (tool === 'send_3chat_customer_messages' || tool === 'send_3chat_group_messages') {
      const bodies = [result?.structuredContent];
      for (const block of result?.content ?? []) {
        if (block.type === 'text') { try { bodies.push(JSON.parse(block.text)); } catch { /* Plain prose has no job identity. */ } }
      }
      for (const body of bodies) {
        const id = body?.job_id ?? body?.data?.job_id;
        if (typeof id === 'string') {
          const jobs = this.jobs.get(id) ?? new Set(); jobs.add(expectedRegion); this.jobs.set(id, jobs);
        }
      }
    }
    return result;
  }
}

export async function apply(ctx, config) {
  await ctx.plugin(ThreeChatService, config).await();
  ctx.typert.register({ package: PACKAGE_NAME, face: 'host', schemas: [], invocations: publicDescriptors,
    model: { services: [], events: [], objects: [] } });
}
