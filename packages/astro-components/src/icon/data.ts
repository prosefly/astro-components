import { validateIconSet } from '@iconify/utils';

export type IconCollection = ReturnType<typeof validateIconSet>;

const iconCollectionCache = new Map<string, Promise<IconCollection>>();

export function normalizeIconApiBase(apiBase: string): string {
  return apiBase.replace(/\/$/, '');
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

export function loadIconCollection(
  prefix: string,
  icon: string,
  apiBase: string,
): Promise<IconCollection> {
  const normalizedApiBase = normalizeIconApiBase(apiBase);
  const cacheKey = `${normalizedApiBase}:${prefix}:${icon}`;
  const cached = iconCollectionCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = fetch(
    `${normalizedApiBase}/${encodeURIComponent(prefix)}.json?icons=${encodeURIComponent(icon)}`,
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error(
        `Failed to load Iconify data for "${prefix}:${icon}" from ${normalizedApiBase}.`,
      );
    }

    return validateIconSet(await response.json());
  });

  iconCollectionCache.set(cacheKey, request);
  return request;
}
