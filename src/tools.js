export const name = 'threechat-tools';
export const inject = ['threeChat', 'tools'];

const readNames = new Set([
  'search_3chat_customers', 'search_3chat_conversations', 'search_3chat_customers_context',
  'search_3chat_groups', 'search_3chat_groups_context', 'get_3chat_batch_send_status',
]);
const writeNames = new Set([
  'upload_3chat_attachment', 'send_3chat_customer_message', 'send_3chat_customer_messages',
  'send_3chat_customer_whatsapp_template', 'send_3chat_group_message', 'send_3chat_group_messages',
]);
const businessNames = new Set([...readNames, ...writeNames]);

// Keep the canonical MCP result intact. Render text once, with any additional
// structured data alongside it; unknown MCP block kinds remain inspectable JSON.
const output = {
  schema: { type: 'object', additionalProperties: true },
  render(_args, value) {
    if (!Array.isArray(value.content)) return [{ type: 'text', text: JSON.stringify(value) }];
    const content = value.content.map(block => ({
      type: 'text', text: block.type === 'text' && typeof block.text === 'string' ? block.text : JSON.stringify(block),
    }));
    const { content: _content, structuredContent, ...metadata } = value;
    if (structuredContent !== undefined) {
      const json = JSON.stringify(structuredContent);
      const represented = content.some(block => {
        try { return JSON.stringify(JSON.parse(block.text)) === json; } catch { return false; }
      });
      if (!represented) content.push({ type: 'text', text: JSON.stringify({ structuredContent }) });
    }
    if (Object.keys(metadata).length) content.push({ type: 'text', text: JSON.stringify(metadata) });
    return content.length ? content : [{ type: 'text', text: JSON.stringify(value) }];
  },
};

function approvalReason(name, args, locale = 'zh') {
  if (locale === 'en') {
    if (name === 'upload_3chat_attachment') return `Upload ${JSON.stringify(args.file_name ?? '(unnamed file)')} to 3Chat International for this operation.`;
    return `Send through 3Chat International to ${JSON.stringify((Array.isArray(args.items) ? args.items : [args]).map(item => ({ customer_id: item.customer_id ?? args.customer_id, group_id: item.group_id ?? args.group_id, channel_account_id: item.channel_account_id ?? args.channel_account_id })))}. Review recipients, content, attachments, and scope before approving this operation.`;
  }
  if (name === 'upload_3chat_attachment') {
    return `${name} 将上传文件 ${JSON.stringify(args.file_name ?? '(未提供文件名)')} 到 3Chat。此审批仅允许本次上传。`;
  }
  const targets = (Array.isArray(args.items) ? args.items : [args]).map(item => {
    const fields = {};
    for (const key of ['customer_id', 'group_id', 'channel_account_id']) {
      if (item[key] !== undefined) fields[key] = item[key];
      else if (args[key] !== undefined) fields[key] = args[key];
    }
    return fields;
  });
  return `${name} 将向这些目标发送消息：${JSON.stringify(targets)}。发送前须按 3chat-customer-growth 技能确认准确收件人、账号、最终内容、附件和范围；此宿主审批仅为本次执行门槛。`;
}

export async function apply(ctx) {
  let disposed = false;
  let generation = [];
  let definitions = [];
  let controls = [];
  let controlLocale;
  let writeTail = Promise.resolve();
  const clear = disposers => { for (const dispose of disposers.reverse()) dispose(); };
  const register = next => {
    const disposers = [];
    try {
      for (const definition of next) disposers.push(ctx.tools.register(definition));
      return disposers;
    } catch (error) {
      clear(disposers);
      throw error;
    }
  };
  const replace = catalog => {
    if (disposed) return;
    if (!Array.isArray(catalog) || (
        new Set(catalog.map(tool => tool.name)).size !== catalog.length ||
        catalog.some(tool => !businessNames.has(tool.name) || !tool.inputSchema || typeof tool.inputSchema !== 'object'))) {
      throw new Error('Invalid 3Chat tool definitions.');
    }
    refreshControls();
    // Build the complete generation before changing the host registry.
    const connector = ctx.threeChat.capturedConnector?.();
    const next = catalog.map(tool => ({
      name: tool.name,
      description: connector ? `${connector.locale === 'en' ? 'Read skill(3chat-customer-growth) first.' : '先读取 skill(3chat-customer-growth)。'} [${connector.title}] ${tool.description ?? ''}` : `先读取 skill(3chat-customer-growth)。${tool.description ?? ''}`,
      parameters: tool.inputSchema,
      output,
      isConcurrencySafe: () => readNames.has(tool.name),
      execute(args, execution) {
        const call = () => {
          execution?.signal?.throwIfAborted();
          return connector ? connector.call(tool.name, args, execution?.signal) : ctx.threeChat.call(tool.name, args, execution?.signal);
        };
        if (!writeNames.has(tool.name)) return call();
        // The host scheduler treats writes as exclusive; this queue also covers
        // callers using tools.execute directly instead of that scheduler.
        const pending = writeTail.then(call);
        writeTail = pending.catch(() => {});
        return pending;
      },
    }));
    clear(generation);
    generation = [];
    try {
      generation = register(next);
      definitions = next;
    } catch (error) {
      generation = register(definitions);
      throw error;
    }
  };
  ctx.on('tools/pre-execute', async (execution, next) => {
    const decision = await next();
    if (decision.kind !== 'allow' || !writeNames.has(execution.name)) return decision;
    return { kind: 'ask', reason: approvalReason(execution.name, execution.arguments, ctx.threeChat.capturedConnector?.().locale ?? 'zh') };
  });
  let unsubscribe = () => {};
  ctx.effect(() => () => {
    disposed = true;
    unsubscribe();
    clear(generation);
    clear(controls);
    generation = [];
  });
  const refreshControls = () => {
    const locale = ctx.threeChat.capturedConnector?.().locale ?? 'zh';
    if (controlLocale === locale && controls.length) return;
    controlLocale = locale;
    clear(controls); controls = [];
    for (const check of [false, true]) controls.push(ctx.tools.register({
    name: check ? 'threechat_check_connection' : 'threechat_connection',
    description: locale === 'en'
      ? (check ? 'Check live 3Chat International connectivity once, only when requested by the user.' : 'Read the selected 3Chat connector’s local state without contacting its server.')
      : (check ? '仅当用户明确要求实际检查3Chat连接时调用，一次实时检查。' : '查看当前3Chat连接状态，只读取本机状态，不发起网络探测。'),
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output,
    async execute(args) {
      if (Object.keys(args ?? {}).length) return { status: 'invalid-arguments', message: locale === 'en' ? 'This tool accepts no arguments. Use threechat_connection({}) for local status or threechat_check_connection({}) for a live check.' : '该工具不接受参数；查看状态用threechat_connection({})，实际检查用threechat_check_connection({})。' };
      const state = check ? await ctx.threeChat.check(locale) : await ctx.threeChat.status(locale);
      return {
        status: state.status, message: state.message,
        verification: check
          ? (state.checkPerformed === false ? 'not-run' : state.status === 'connected' && !state.error ? 'live' : state.error ? 'failed' : 'not-run')
          : 'local',
        server: state.serverLabel,
        ...(state.lastCheckedAt ? { lastCheckedAt: state.lastCheckedAt } : {}),
        ...(state.error ? { error: state.error } : {}),
        ...(state.status === 'unavailable' ? { nextAction: locale === 'en' ? 'The cause is unknown. Try again later before reauthorizing.' : '原因尚未确定，可稍后重试；无需因一次临时失败直接重新授权。' } :
          !state.connected ? { nextAction: locale === 'en' ? 'Open Plugins → 3Chat Customer Growth, select Connect, and authorize the international service in your browser.' : '打开「插件 → 3Chat 私域客户运营」，点击连接并在浏览器授权。' } : {}),
      };
    },
  }));
  };
  replace(ctx.threeChat.getToolDefinitions());
  unsubscribe = ctx.threeChat.subscribeTools(replace);
  // Startup waits for discovery of an existing authorization before the host
  // assembles schemas. The service owns cancellation; late events are ignored
  // after this plugin's subscription has been disposed.
  if (typeof ctx.threeChat.refreshTools === 'function') await ctx.threeChat.refreshTools();
}
