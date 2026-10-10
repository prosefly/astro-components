import { getIconData, validateIconSet } from '@iconify/utils';
import { iconCacheDirectory, readCachedIcon, writeCachedIcon, type CachedIcon, type IconData } from './cache.js';

export type IconCollection = ReturnType<typeof validateIconSet>;

interface IconEntry {
  expiresAt: number;
  promise: Promise<IconData>;
}

const iconCache = new Map<string, IconEntry>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeIconApiBase(apiBase: string): string {
  return apiBase.replace(/\/+$/, '');
}

export function parseIconName(name: string): { prefix: string; icon: string } {
  const separatorIndex = name.indexOf(':');

  if (separatorIndex <= 0 || separatorIndex === name.length - 1) {
    throw new Error(`Icon name "${name}" must use the "prefix:icon" format.`);
  }

  return {
    icon: name.slice(separatorIndex + 1),
    prefix: name.slice(0, separatorIndex),
  };
}

export async function loadIconCollection(
  prefix: string,
  icons: string | string[],
  apiBase: string,
): Promise<IconCollection> {
  const normalizedApiBase = normalizeIconApiBase(apiBase);
  const directory = iconCacheDirectory();
  const names = [...new Set(typeof icons === 'string' ? [icons] : icons)].sort();
  const keyFor = (icon: string) => JSON.stringify([normalizedApiBase, prefix, icon]);
  const memoryKeyFor = (icon: string) => JSON.stringify([directory, keyFor(icon)]);
  const now = Date.now();
  const missing = names.filter((icon) => {
    const entry = iconCache.get(memoryKeyFor(icon));
    return !entry || entry.expiresAt <= now;
  });

  if (missing.length > 0) {
    // Reserve each icon before reading disk or fetching, so overlapping batches
    // and single-icon requests share the same in-flight work.
    const batch = resolveIcons(prefix, missing, normalizedApiBase, directory, keyFor);
    for (const icon of missing) {
      const key = memoryKeyFor(icon);
      const entry: IconEntry = {
        expiresAt: Number.POSITIVE_INFINITY,
        promise: batch.then((resolved) => {
          const cached = resolved.get(icon);
          if (!cached) throw new Error(`Icon "${prefix}:${icon}" was not found in the Iconify API response.`);
          entry.expiresAt = cached.expiresAt;
          return cached.data;
        }),
      };
      iconCache.set(key, entry);
      void entry.promise.catch(() => {
        if (iconCache.get(key) === entry) iconCache.delete(key);
      });
    }
  }

  const entries = await Promise.all(names.map(async (icon) => {
    const entry = iconCache.get(memoryKeyFor(icon));
    if (!entry) throw new Error(`Missing cache entry for "${prefix}:${icon}".`);
    return [icon, await entry.promise] as const;
  }));
  return { prefix, icons: Object.fromEntries(entries) };
}

async function resolveIcons(
  prefix: string,
  icons: string[],
  apiBase: string,
  directory: string,
  keyFor: (icon: string) => string,
): Promise<Map<string, CachedIcon>> {
  const resolved = new Map<string, CachedIcon>();
  await Promise.all(icons.map(async (icon) => {
    const cached = await readCachedIcon(directory, keyFor(icon), prefix, icon);
    if (cached) resolved.set(icon, cached);
  }));
  const missing = icons.filter((icon) => !resolved.has(icon));
  if (missing.length === 0) return resolved;

  const query = missing.map((icon) => encodeURIComponent(icon)).join(',');
  const response = await fetch(`${apiBase}/${encodeURIComponent(prefix)}.json?icons=${query}`);
  if (!response.ok) {
    throw new Error(`Failed to load Iconify data for "${prefix}" from ${apiBase} (HTTP ${response.status}).`);
  }
  const collection = validateIconSet(await response.json());
  if (collection.prefix !== prefix) throw new Error(`Unexpected Iconify prefix "${collection.prefix}" for "${prefix}".`);

  const expiresAt = Date.now() + CACHE_TTL_MS;
  await Promise.all(missing.map(async (icon) => {
    const data = getIconData(collection, icon);
    if (!data) return;
    const cached = { data, expiresAt };
    resolved.set(icon, cached);
    await writeCachedIcon(directory, keyFor(icon), cached);
  }));
  return resolved;
}
