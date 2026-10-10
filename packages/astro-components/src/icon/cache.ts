import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getIconData, validateIconSet } from '@iconify/utils';

export type IconData = NonNullable<ReturnType<typeof getIconData>>;

export interface CachedIcon {
  data: IconData;
  expiresAt: number;
}

export function iconCacheDirectory(): string {
  const configured = process.env.PROSEFLY_ICON_CACHE_DIR;
  return configured ? resolve(configured) : resolve(process.cwd(), '.astro', 'prosefly', 'icons');
}

function cachePath(directory: string, key: string): string {
  const digest = createHash('sha256').update(key).digest('hex');
  return join(directory, `icon-v1-${digest}.json`);
}

export async function readCachedIcon(
  directory: string,
  key: string,
  prefix: string,
  icon: string,
): Promise<CachedIcon | undefined> {
  try {
    const stored: unknown = JSON.parse(await readFile(cachePath(directory, key), 'utf8'));
    if (!stored || typeof stored !== 'object') return;
    const entry = stored as Partial<CachedIcon> & { version?: unknown; key?: unknown };
    if (
      entry.version !== 1 || entry.key !== key ||
      typeof entry.expiresAt !== 'number' || !Number.isFinite(entry.expiresAt) ||
      entry.expiresAt <= Date.now()
    ) return;

    const collection = validateIconSet({ prefix, icons: { [icon]: entry.data } });
    const data = getIconData(collection, icon);
    if (data) return { data, expiresAt: entry.expiresAt };
  } catch {
    // Missing, corrupt, and unreadable files are cache misses.
  }
}

export async function writeCachedIcon(directory: string, key: string, entry: CachedIcon): Promise<void> {
  const path = cachePath(directory, key);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, JSON.stringify({ version: 1, key, ...entry }), 'utf8');
    await rename(temporaryPath, path);
  } catch {
    // Persistence is optional on read-only or ephemeral filesystems.
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}
