import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// Skill 1.0.4 defines this public business surface. Discovery supplies schemas,
// including tenant fields; other remote/internal tools never become public.
export const TOOL_NAMES = Object.freeze([
  'search_3chat_customers', 'search_3chat_conversations',
  'search_3chat_customers_context', 'search_3chat_groups', 'search_3chat_groups_context',
  'upload_3chat_attachment', 'send_3chat_customer_message', 'send_3chat_customer_messages',
  'send_3chat_customer_whatsapp_template', 'send_3chat_group_message',
  'send_3chat_group_messages', 'get_3chat_batch_send_status',
]);
export const WRITE_TOOLS = new Set(TOOL_NAMES.filter(name => name.startsWith('send_') || name.startsWith('upload_')));

export class ToolContractError extends Error {
  constructor(code, message, field) { super(message); this.code = code; this.field = field; }
}

const validators = new WeakMap();
const compilers = [new Ajv({ strict: false }), new Ajv2020({ strict: false })];
for (const compiler of compilers) {
  addFormats(compiler);
  compiler.addFormat('int32', { type: 'number', validate: n => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647 });
  compiler.addFormat('int64', { type: 'number', validate: Number.isSafeInteger });
}
function validatorFor(tool) {
  let validator = validators.get(tool);
  if (!validator) {
    const compiler = tool.inputSchema.$schema?.includes('2020-12') ? compilers[1] : compilers[0];
    // Remote schemas commonly share an $id. Compile anonymously so tenants
    // cannot accidentally reuse another tenant's cached schema by that ID.
    const schema = { ...tool.inputSchema }; delete schema.$id;
    validator = compiler.compile(schema);
    validators.set(tool, validator);
  }
  return validator;
}

export function prepareCatalog(tools) {
  const catalog = new Map();
  const duplicates = new Set();
  for (const tool of tools) {
    if (!tool || !TOOL_NAMES.includes(tool.name) || duplicates.has(tool.name)) continue;
    if (catalog.has(tool.name)) {
      catalog.delete(tool.name);
      duplicates.add(tool.name);
      continue;
    }
    if (tool.inputSchema?.type !== 'object') continue;
    // Omit unusable capabilities individually. Keep server schemas unchanged;
    // never invent arguments or retain a tool removed from the live catalog.
    const copy = structuredClone(tool);
    try { validatorFor(copy); }
    catch { continue; }
    catalog.set(tool.name, copy);
  }
  return new Map(TOOL_NAMES.filter(name => catalog.has(name)).map(name => [name, catalog.get(name)]));
}

export function validateArguments(tool, args) {
  if (!tool || !TOOL_NAMES.includes(tool.name))
    throw new ToolContractError('UNSUPPORTED_TOOL', '该工具不在 Skill 1.0.4 的公开能力清单中。');
  const validate = validatorFor(tool);
  if (!validate(args)) {
    const error = validate.errors?.[0];
    const field = error?.instancePath?.slice(1).replaceAll('/', '.') || error?.params?.missingProperty || 'arguments';
    throw new ToolContractError('INVALID_ARGUMENTS', `请按当前工具参数声明核对 ${field}。`, field);
  }
  return args;
}
