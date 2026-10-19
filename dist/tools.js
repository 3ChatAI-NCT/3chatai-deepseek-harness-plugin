import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/tools.js
var name = "threechat-tools";
var inject = ["threeChat", "tools"];
var readNames = /* @__PURE__ */ new Set([
  "search_3chat_customers",
  "search_3chat_conversations",
  "search_3chat_customers_context",
  "search_3chat_groups",
  "search_3chat_groups_context",
  "get_3chat_batch_send_status"
]);
var writeNames = /* @__PURE__ */ new Set([
  "upload_3chat_attachment",
  "send_3chat_customer_message",
  "send_3chat_customer_messages",
  "send_3chat_customer_whatsapp_template",
  "send_3chat_group_message",
  "send_3chat_group_messages"
]);
var businessNames = /* @__PURE__ */ new Set([...readNames, ...writeNames]);
var output = {
  schema: { type: "object", additionalProperties: true },
  render(_args, value) {
    if (!Array.isArray(value.content)) return [{ type: "text", text: JSON.stringify(value) }];
    const content = value.content.map((block) => ({
      type: "text",
      text: block.type === "text" && typeof block.text === "string" ? block.text : JSON.stringify(block)
    }));
    const { content: _content, structuredContent, ...metadata } = value;
    if (structuredContent !== void 0) {
      const json = JSON.stringify(structuredContent);
      const represented = content.some((block) => {
        try {
          return JSON.stringify(JSON.parse(block.text)) === json;
        } catch {
          return false;
        }
      });
      if (!represented) content.push({ type: "text", text: JSON.stringify({ structuredContent }) });
    }
    if (Object.keys(metadata).length) content.push({ type: "text", text: JSON.stringify(metadata) });
    return content.length ? content : [{ type: "text", text: JSON.stringify(value) }];
  }
};
function approvalReason(name2, args, locale = "zh") {
  if (locale === "en") {
    if (name2 === "upload_3chat_attachment") return `Upload ${JSON.stringify(args.file_name ?? "(unnamed file)")} to 3Chat International for this operation.`;
    return `Send through 3Chat International to ${JSON.stringify((Array.isArray(args.items) ? args.items : [args]).map((item) => ({ customer_id: item.customer_id ?? args.customer_id, group_id: item.group_id ?? args.group_id, channel_account_id: item.channel_account_id ?? args.channel_account_id })))}. Review recipients, content, attachments, and scope before approving this operation.`;
  }
  if (name2 === "upload_3chat_attachment") {
    return `${name2} \u5C06\u4E0A\u4F20\u6587\u4EF6 ${JSON.stringify(args.file_name ?? "(\u672A\u63D0\u4F9B\u6587\u4EF6\u540D)")} \u5230 3Chat\u3002\u6B64\u5BA1\u6279\u4EC5\u5141\u8BB8\u672C\u6B21\u4E0A\u4F20\u3002`;
  }
  const targets = (Array.isArray(args.items) ? args.items : [args]).map((item) => {
    const fields = {};
    for (const key of ["customer_id", "group_id", "channel_account_id"]) {
      if (item[key] !== void 0) fields[key] = item[key];
      else if (args[key] !== void 0) fields[key] = args[key];
    }
    return fields;
  });
  return `${name2} \u5C06\u5411\u8FD9\u4E9B\u76EE\u6807\u53D1\u9001\u6D88\u606F\uFF1A${JSON.stringify(targets)}\u3002\u53D1\u9001\u524D\u987B\u6309 3chat-customer-growth \u6280\u80FD\u786E\u8BA4\u51C6\u786E\u6536\u4EF6\u4EBA\u3001\u8D26\u53F7\u3001\u6700\u7EC8\u5185\u5BB9\u3001\u9644\u4EF6\u548C\u8303\u56F4\uFF1B\u6B64\u5BBF\u4E3B\u5BA1\u6279\u4EC5\u4E3A\u672C\u6B21\u6267\u884C\u95E8\u69DB\u3002`;
}
async function apply(ctx) {
  let disposed = false;
  let generation = [];
  let definitions = [];
  let controls = [];
  let controlLocale;
  let writeTail = Promise.resolve();
  const clear = (disposers) => {
    for (const dispose of disposers.reverse()) dispose();
  };
  const register = (next) => {
    const disposers = [];
    try {
      for (const definition of next) disposers.push(ctx.tools.register(definition));
      return disposers;
    } catch (error) {
      clear(disposers);
      throw error;
    }
  };
  const replace = (catalog) => {
    if (disposed) return;
    if (!Array.isArray(catalog) || (new Set(catalog.map((tool) => tool.name)).size !== catalog.length || catalog.some((tool) => !businessNames.has(tool.name) || !tool.inputSchema || typeof tool.inputSchema !== "object"))) {
      throw new Error("Invalid 3Chat tool definitions.");
    }
    refreshControls();
    const connector = ctx.threeChat.capturedConnector?.();
    const next = catalog.map((tool) => ({
      name: tool.name,
      description: connector ? `${connector.locale === "en" ? "Read skill(3chat-customer-growth) first." : "\u5148\u8BFB\u53D6 skill(3chat-customer-growth)\u3002"} [${connector.title}] ${tool.description ?? ""}` : `\u5148\u8BFB\u53D6 skill(3chat-customer-growth)\u3002${tool.description ?? ""}`,
      parameters: tool.inputSchema,
      output,
      isConcurrencySafe: () => readNames.has(tool.name),
      execute(args, execution) {
        const call = () => {
          execution?.signal?.throwIfAborted();
          return connector ? connector.call(tool.name, args, execution?.signal) : ctx.threeChat.call(tool.name, args, execution?.signal);
        };
        if (!writeNames.has(tool.name)) return call();
        const pending = writeTail.then(call);
        writeTail = pending.catch(() => {
        });
        return pending;
      }
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
  ctx.on("tools/pre-execute", async (execution, next) => {
    const decision = await next();
    if (decision.kind !== "allow" || !writeNames.has(execution.name)) return decision;
    return { kind: "ask", reason: approvalReason(execution.name, execution.arguments, ctx.threeChat.capturedConnector?.().locale ?? "zh") };
  });
  let unsubscribe = () => {
  };
  ctx.effect(() => () => {
    disposed = true;
    unsubscribe();
    clear(generation);
    clear(controls);
    generation = [];
  });
  const refreshControls = () => {
    const locale = ctx.threeChat.capturedConnector?.().locale ?? "zh";
    if (controlLocale === locale && controls.length) return;
    controlLocale = locale;
    clear(controls);
    controls = [];
    for (const check of [false, true]) controls.push(ctx.tools.register({
      name: check ? "threechat_check_connection" : "threechat_connection",
      description: locale === "en" ? check ? "Check live 3Chat International connectivity once, only when requested by the user." : "Read the selected 3Chat connector\u2019s local state without contacting its server." : check ? "\u4EC5\u5F53\u7528\u6237\u660E\u786E\u8981\u6C42\u5B9E\u9645\u68C0\u67E53Chat\u8FDE\u63A5\u65F6\u8C03\u7528\uFF0C\u4E00\u6B21\u5B9E\u65F6\u68C0\u67E5\u3002" : "\u67E5\u770B\u5F53\u524D3Chat\u8FDE\u63A5\u72B6\u6001\uFF0C\u53EA\u8BFB\u53D6\u672C\u673A\u72B6\u6001\uFF0C\u4E0D\u53D1\u8D77\u7F51\u7EDC\u63A2\u6D4B\u3002",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      output,
      async execute(args) {
        if (Object.keys(args ?? {}).length) return { status: "invalid-arguments", message: locale === "en" ? "This tool accepts no arguments. Use threechat_connection({}) for local status or threechat_check_connection({}) for a live check." : "\u8BE5\u5DE5\u5177\u4E0D\u63A5\u53D7\u53C2\u6570\uFF1B\u67E5\u770B\u72B6\u6001\u7528threechat_connection({})\uFF0C\u5B9E\u9645\u68C0\u67E5\u7528threechat_check_connection({})\u3002" };
        const state = check ? await ctx.threeChat.check(locale) : await ctx.threeChat.status(locale);
        return {
          status: state.status,
          message: state.message,
          verification: check ? state.checkPerformed === false ? "not-run" : state.status === "connected" && !state.error ? "live" : state.error ? "failed" : "not-run" : "local",
          server: state.serverLabel,
          ...state.lastCheckedAt ? { lastCheckedAt: state.lastCheckedAt } : {},
          ...state.error ? { error: state.error } : {},
          ...state.status === "unavailable" ? { nextAction: locale === "en" ? "The cause is unknown. Try again later before reauthorizing." : "\u539F\u56E0\u5C1A\u672A\u786E\u5B9A\uFF0C\u53EF\u7A0D\u540E\u91CD\u8BD5\uFF1B\u65E0\u9700\u56E0\u4E00\u6B21\u4E34\u65F6\u5931\u8D25\u76F4\u63A5\u91CD\u65B0\u6388\u6743\u3002" } : !state.connected ? { nextAction: locale === "en" ? "Open Plugins \u2192 3Chat Customer Growth, select Connect, and authorize the international service in your browser." : "\u6253\u5F00\u300C\u63D2\u4EF6 \u2192 3Chat \u79C1\u57DF\u5BA2\u6237\u8FD0\u8425\u300D\uFF0C\u70B9\u51FB\u8FDE\u63A5\u5E76\u5728\u6D4F\u89C8\u5668\u6388\u6743\u3002" } : {}
        };
      }
    }));
  };
  replace(ctx.threeChat.getToolDefinitions());
  unsubscribe = ctx.threeChat.subscribeTools(replace);
  if (typeof ctx.threeChat.refreshTools === "function") await ctx.threeChat.refreshTools();
}
export {
  apply,
  inject,
  name
};
