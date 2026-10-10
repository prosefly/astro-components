import type { MiddlewareHandler } from 'astro';
import { loadIconCollection, normalizeIconApiBase } from './iconify.js';

/** Warm the same per-icon cache used by Icon's on-demand rendering. */
export function createIconMiddleware(config: {
  apiBase: string;
  iconsByPrefix: Record<string, string[]>;
}): MiddlewareHandler {
  const apiBase = normalizeIconApiBase(config.apiBase);
  return async (context, next) => {
    await Promise.all(Object.entries(config.iconsByPrefix)
      .filter(([, icons]) => icons.length > 0)
      .map(([prefix, icons]) => loadIconCollection(prefix, icons, apiBase)));

    const locals = context.locals as typeof context.locals & { proseflyIconApiBase?: string };
    locals.proseflyIconApiBase = apiBase;
    return next();
  };
}
