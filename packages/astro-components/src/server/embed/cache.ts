import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

interface Entry<T> {
  expiresAt: number;
  value: Promise<T>;
}

interface StoredEntry<T> {
  version: 1;
  key: string;
  expiresAt: number;
  value: T;
}

const entries = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 256;
const FILE_PREFIX = 'embed-v1-';
const FILE_PATTERN = /^embed-v1-[a-f0-9]{64}\.json$/;
let hasPrunedFiles = false;

/** Cache resolved metadata, coalesce simultaneous requests, and persist successful results. */
export function remember<T>(
  key: string,
  ttl: number | ((value: T) => number),
  resolveValue: () => Promise<T>,
  rejectionTtl = 0,
): Promise<T> {
  const now = Date.now();
  const existing = entries.get(key) as Entry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    entries.delete(key);
    entries.set(key, existing);
    return existing.value;
  }

  const entry = {} as Entry<T>;
  const value = restoreOrResolve(key, ttl, resolveValue, entry);
  entry.expiresAt = Number.POSITIVE_INFINITY;
  entry.value = value;
  entries.delete(key);
  pruneMemory(now);
  entries.set(key, entry);

  value.catch(() => {
    if (rejectionTtl > 0) {
      entry.expiresAt = Date.now() + rejectionTtl;
    } else if (entries.get(key)?.value === value) {
      entries.delete(key);
    }
  });

  return value;
}

/** Clear both memory and persisted Embed cache entries. */
export async function clearEmbedCache(): Promise<void> {
  clearMemoryCache();
  hasPrunedFiles = false;

  try {
    const directory = cacheDirectory();
    const files = await readdir(directory);
    await Promise.all(
      files
        .filter((file) => FILE_PATTERN.test(file))
        .map((file) => unlink(join(directory, file)).catch(() => undefined)),
    );
  } catch {
    // A missing or read-only cache directory is equivalent to an empty cache.
  }
}

export function clearMemoryCache(): void {
  entries.clear();
}

async function restoreOrResolve<T>(
  key: string,
  ttl: number | ((value: T) => number),
  resolveValue: () => Promise<T>,
  entry: Entry<T>,
): Promise<T> {
  const stored = await readStored<T>(key);
  if (stored) {
    entry.expiresAt = stored.expiresAt;
    return stored.value;
  }

  const value = await resolveValue();
  const duration = typeof ttl === 'function' ? ttl(value) : ttl;
  entry.expiresAt = Date.now() + duration;

  if (Number.isFinite(duration) && duration > 0) {
    await writeStored(key, value, entry.expiresAt);
  }

  return value;
}

async function readStored<T>(key: string): Promise<StoredEntry<T> | undefined> {
  const path = cachePath(key);

  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!isStoredEntry<T>(value, key) || value.expiresAt <= Date.now()) {
      await unlink(path).catch(() => undefined);
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

async function writeStored<T>(key: string, value: T, expiresAt: number): Promise<void> {
  const directory = cacheDirectory();
  const path = cachePath(key);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const stored: StoredEntry<T> = { version: 1, key, expiresAt, value };

  try {
    await mkdir(directory, { recursive: true });
    await pruneFiles(directory);
    await writeFile(temporaryPath, JSON.stringify(stored), 'utf8');
    await rename(temporaryPath, path);
  } catch {
    // Read-only filesystems still receive the in-memory cache value.
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function pruneFiles(directory: string): Promise<void> {
  if (hasPrunedFiles) return;
  hasPrunedFiles = true;

  try {
    const files = (await readdir(directory)).filter((file) => FILE_PATTERN.test(file));
    const stored = await Promise.all(
      files.map(async (file) => {
        const path = join(directory, file);
        try {
          const value: unknown = JSON.parse(await readFile(path, 'utf8'));
          if (!isStoredEntry(value) || value.expiresAt <= Date.now()) {
            await unlink(path).catch(() => undefined);
            return undefined;
          }
          return { path, expiresAt: value.expiresAt };
        } catch {
          await unlink(path).catch(() => undefined);
          return undefined;
        }
      }),
    );
    const active = stored
      .filter((item): item is { path: string; expiresAt: number } => Boolean(item))
      .sort((a, b) => a.expiresAt - b.expiresAt);

    await Promise.all(
      active
        .slice(0, Math.max(0, active.length - MAX_ENTRIES + 1))
        .map((item) => unlink(item.path).catch(() => undefined)),
    );
  } catch {
    // Cache cleanup is best effort.
  }
}

function isStoredEntry<T>(value: unknown, key?: string): value is StoredEntry<T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const stored = value as Partial<StoredEntry<T>>;
  return (
    stored.version === 1 &&
    typeof stored.key === 'string' &&
    (key === undefined || stored.key === key) &&
    typeof stored.expiresAt === 'number' &&
    Number.isFinite(stored.expiresAt) &&
    Object.hasOwn(stored, 'value')
  );
}

function cacheDirectory(): string {
  const configured = process.env.PROSEFLY_EMBED_CACHE_DIR;
  return configured
    ? resolve(configured)
    : resolve(process.cwd(), '.astro', 'prosefly', 'embed');
}

function cachePath(key: string): string {
  const digest = createHash('sha256').update(key).digest('hex');
  return join(cacheDirectory(), `${FILE_PREFIX}${digest}.json`);
}

function pruneMemory(now: number): void {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }

  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}
