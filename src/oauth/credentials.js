/** Convert SDK state into a plain JSON grant for DSH credentials. */
export function readGrant(record) {
  if (record === undefined || record === null || record.kind !== 'grant') return {};
  const payload = record.payload;
  return payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
}

/**
 * Raised when a value has no explicit JSON spelling. Carries the field path and the
 * prototype name only — never the value — so a diagnostic can name the offending
 * field without leaking a credential.
 */
class UnserializableCredentialValue extends TypeError {
  constructor(path, prototypeName) {
    super(
      `credential payload field "${path || '<root>'}" holds a value with no explicit JSON spelling ` +
        `(prototype: ${prototypeName}); add an explicit conversion instead of dropping it`,
    );
    this.name = 'UnserializableCredentialValue';
    this.path = path;
    this.prototypeName = prototypeName;
  }
}

/** A prototype whose values already have the JSON shape they should be stored as. */
function isPlainObject(value) {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Explicitly serialize a value the SDK hands the credential seam.
 *
 * `credentials-local` rejects any object whose prototype is not `Object.prototype`
 * (or `null`), because such a value cannot round-trip through the YAML document
 * faithfully. The SDK's discovery results legitimately carry richer types, so those
 * are converted here **explicitly, one type at a time**. Anything not listed throws
 * {@link UnserializableCredentialValue} naming the field path and the prototype: a
 * silent drop would mask a protocol bug by storing a quietly incomplete credential.
 *
 * The result is always plain JSON. `undefined` means "this field has no value", which
 * JSON expresses by absence.
 *
 * @param {unknown} value
 * @param {string} [path] Field path for diagnostics, e.g. `discoveryState.resourceMetadataUrl`.
 * @returns {unknown}
 */
function toCredentialJson(value, path = '') {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return value;
  if (type === 'number') {
    if (Number.isFinite(value)) return value;
    throw new UnserializableCredentialValue(path, 'non-finite number');
  }
  if (type === 'bigint' || type === 'symbol' || type === 'function') {
    throw new UnserializableCredentialValue(path, type);
  }

  if (Array.isArray(value)) return value.map((item, index) => toCredentialJson(item, `${path}[${index}]`));
  if (value instanceof Date) return value.toISOString();
  if (value instanceof URL) return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value instanceof Headers) return Object.fromEntries(value.entries());
  if (value instanceof Map) return toCredentialJson(Object.fromEntries(value), path);
  if (value instanceof Set) return toCredentialJson([...value], path);
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString('base64');
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64');
  }

  if (isPlainObject(value)) {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const converted = toCredentialJson(nested, path ? `${path}.${key}` : key);
      if (converted !== undefined) out[key] = converted;
    }
    return out;
  }

  const proto = Object.getPrototypeOf(value);
  throw new UnserializableCredentialValue(path, proto === null ? 'null' : proto.constructor?.name ?? '<anonymous>');
}

/** Tag a credential record's payload so nothing unrepresentable can be stored. */
export function toStorableGrant(payload) {
  return { kind: 'grant', payload: toCredentialJson(payload, 'payload') };
}
