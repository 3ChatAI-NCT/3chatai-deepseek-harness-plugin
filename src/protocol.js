import { z } from 'zod';
import manifest from '../package.json' with { type: 'json' };

export const PACKAGE_NAME = manifest.name;
export const VERSION = manifest.version;

// This is the entire browser-visible contract. Credential payloads never cross it.
export const ConnectionView = z.object({
  region: z.enum(['cn', 'global']).optional(),
  locale: z.enum(['zh', 'en']).optional(),
  status: z.enum(['disconnected', 'connecting', 'connected', 'reconnect-required', 'unavailable']),
  message: z.string(),
  serverLabel: z.string(),
  connected: z.boolean(),
  pending: z.boolean(),
  authorizationUrl: z.string().optional(),
  expiresAt: z.string().optional(),
  grantedScopes: z.array(z.string()),
  lastCheckedAt: z.string().optional(),
  scopeNotice: z.string().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export const publicDescriptors = ['selectLocale', 'status', 'connect', 'cancel', 'disconnect', 'check'].map((method) => ({
  id: `${PACKAGE_NAME}#threeChat/${method}`,
  service: 'threeChat',
  namespace: 'threeChat',
  method,
  invocation: { kind: 'direct' },
  parameters: [{ name: 'locale', wire: 'locale', source: 'json', codec: { mode: 'strict', typeSymbol: `${PACKAGE_NAME}#Locale`, create: () => z.enum(['zh', 'en']) } }],
  result: { mode: 'strict', typeSymbol: `${PACKAGE_NAME}#ConnectionView`, create: () => ConnectionView },
}));
