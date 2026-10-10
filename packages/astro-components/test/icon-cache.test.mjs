import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getIconData } from '@iconify/utils';
import { loadIconCollection } from '../dist/icon/iconify.js';
import { createIconMiddleware } from '../dist/icon/preload.js';

const apiBase = 'https://icons.example.test';

test.beforeEach(async (context) => {
  const previous = process.env.PROSEFLY_ICON_CACHE_DIR;
  const directory = await mkdtemp(join(tmpdir(), 'prosefly-icon-test-'));
  process.env.PROSEFLY_ICON_CACHE_DIR = directory;
  context.after(async () => {
    if (previous === undefined) delete process.env.PROSEFLY_ICON_CACHE_DIR;
    else process.env.PROSEFLY_ICON_CACHE_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  });
});

function responseFor(input, body = '<path d="M1 2h3"/>') {
  const url = new URL(input);
  const prefix = url.pathname.slice(1, -5);
  const names = url.searchParams.get('icons').split(',');
  return Response.json({
    prefix, width: 24, height: 32,
    icons: Object.fromEntries(names.map((name) => [name, { body }])),
  });
}

async function restartedLoader() {
  const url = new URL('../dist/icon/iconify.js', import.meta.url);
  url.searchParams.set('restart', `${Date.now()}-${Math.random()}`);
  return (await import(url.href)).loadIconCollection;
}

async function cacheFiles() {
  const directory = process.env.PROSEFLY_ICON_CACHE_DIR;
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
  return files.map((file) => join(directory, file));
}

test('preloading and on-demand rendering reuse icons in both directions', async (context) => {
  const requests = [];
  context.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(new URL(url).searchParams.get('icons'));
    return responseFor(url);
  });
  await loadIconCollection('lucide', 'star', apiBase);
  const middleware = createIconMiddleware({ apiBase, iconsByPrefix: { lucide: ['check', 'star'] } });
  const locals = {};
  let nextCalls = 0;
  const next = () => { nextCalls++; return new Response('OK'); };
  await middleware({ locals }, next);
  await loadIconCollection('lucide', 'check', apiBase);
  await middleware({ locals }, next);
  assert.deepEqual(requests, ['star', 'check']);
  assert.equal(locals.proseflyIconApiBase, apiBase);
  assert.equal(nextCalls, 2);
});

test('overlapping concurrent batches and single-icon requests do not fetch an icon twice', async (context) => {
  const requested = [];
  context.mock.method(globalThis, 'fetch', async (url) => {
    requested.push(...new URL(url).searchParams.get('icons').split(','));
    return responseFor(url);
  });
  const [batch, single, overlapping] = await Promise.all([
    loadIconCollection('lucide', ['star', 'check', 'star'], `${apiBase}/`),
    loadIconCollection('lucide', 'star', apiBase),
    loadIconCollection('lucide', ['star', 'play'], apiBase),
  ]);
  assert.deepEqual(requested.sort(), ['check', 'play', 'star']);
  assert.equal(batch.icons.star.body, single.icons.star.body);
  assert.equal(overlapping.icons.star.body, single.icons.star.body);
});

test('persisted individual icons survive a cold loader and changed preload batches', async (context) => {
  const requests = [];
  context.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(new URL(url).searchParams.get('icons'));
    return responseFor(url);
  });
  await loadIconCollection('lucide', ['check', 'star'], apiBase);
  const loadAgain = await restartedLoader();
  await loadAgain('lucide', 'star', apiBase);
  await loadAgain('lucide', ['star', 'play', 'check'], apiBase);
  assert.deepEqual(requests, ['check,star', 'play']);
  assert.equal((await cacheFiles()).length, 3);
});

test('API endpoints and icon prefixes have separate caches', async (context) => {
  const requests = [];
  context.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(String(url));
    return responseFor(url, String(url).includes('other') ? '<circle r="1"/>' : '<path d="M0 0"/>');
  });
  const first = await loadIconCollection('lucide', 'star', apiBase);
  const second = await loadIconCollection('lucide', 'star', 'https://other.example.test');
  await loadIconCollection('ri', 'star', apiBase);
  assert.notEqual(first.icons.star.body, second.icons.star.body);
  assert.equal(requests.length, 3);
});

test('network and HTTP failures are not cached and the next request retries', async (context) => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url) => {
    calls++;
    if (calls === 1) throw new Error('Network unavailable');
    if (calls === 2) return new Response('Unavailable', { status: 503 });
    return responseFor(url);
  });
  await assert.rejects(loadIconCollection('lucide', 'star', apiBase), /Network unavailable/);
  await assert.rejects(loadIconCollection('lucide', 'star', apiBase), /HTTP 503/);
  await loadIconCollection('lucide', 'star', apiBase);
  await loadIconCollection('lucide', 'star', apiBase);
  assert.equal(calls, 3);
});

test('middleware retries failed prefixes without downloading successful prefixes again', async (context) => {
  const requests = [];
  let failed = false;
  context.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(new URL(url).pathname);
    if (String(url).includes('/ri.') && !failed) {
      failed = true;
      return new Response('Unavailable', { status: 503 });
    }
    return responseFor(url);
  });
  const middleware = createIconMiddleware({ apiBase, iconsByPrefix: { lucide: ['star'], ri: ['check'] } });
  const next = () => new Response('OK');
  await assert.rejects(middleware({ locals: {} }, next), /HTTP 503/);
  await middleware({ locals: {} }, next);
  assert.deepEqual(requests.sort(), ['/lucide.json', '/ri.json', '/ri.json']);
});

test('bad JSON, invalid collections and incorrect prefixes can be retried', async (context) => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url) => {
    calls++;
    if (calls === 1) return new Response('not json');
    if (calls === 2) return Response.json({ prefix: 'lucide', icons: { star: { body: 42 } } });
    if (calls === 3) return Response.json({ prefix: 'wrong', icons: { star: { body: '<path/>' } } });
    return responseFor(url);
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    await assert.rejects(loadIconCollection('lucide', 'star', apiBase));
  }
  await loadIconCollection('lucide', 'star', apiBase);
  assert.equal(calls, 4);
});

test('missing icons are retried while successful icons from the same batch are retained', async (context) => {
  const requests = [];
  context.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(new URL(url).searchParams.get('icons'));
    if (requests.length === 1) {
      return Response.json({ prefix: 'lucide', icons: { star: { body: '<path/>' } }, not_found: ['check'] });
    }
    return responseFor(url);
  });
  await assert.rejects(loadIconCollection('lucide', ['check', 'star'], apiBase), /lucide:check.*not found/);
  await loadIconCollection('lucide', ['check', 'star'], apiBase);
  assert.deepEqual(requests, ['check,star', 'check']);
});

test('cached aliases retain collection dimensions and transforms', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({
    prefix: 'lucide', width: 32, height: 48,
    icons: { base: { body: '<path/>', hFlip: true } },
    aliases: { rotated: { parent: 'base', rotate: 1 } },
  }));
  const first = await loadIconCollection('lucide', 'rotated', apiBase);
  const loadAgain = await restartedLoader();
  context.mock.method(globalThis, 'fetch', async () => assert.fail('alias should be restored from disk'));
  const second = await loadAgain('lucide', 'rotated', apiBase);
  assert.deepEqual(getIconData(first, 'rotated'), getIconData(second, 'rotated'));
  assert.equal(second.icons.rotated.width, 32);
  assert.equal(second.icons.rotated.height, 48);
  assert.equal(second.icons.rotated.hFlip, true);
  assert.equal(second.icons.rotated.rotate, 1);
});

test('expired memory and disk entries are refreshed', async (context) => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url) => { calls++; return responseFor(url); });
  await loadIconCollection('lucide', 'star', apiBase);
  now += 7 * 24 * 60 * 60 * 1000 + 1;
  await loadIconCollection('lucide', 'star', apiBase);
  assert.equal(calls, 2);
});

test('corrupt, invalid and mismatched disk entries are replaced safely', async (context) => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url) => { calls++; return responseFor(url); });
  await loadIconCollection('lucide', 'star', apiBase);
  const [file] = await cacheFiles();
  const stored = JSON.parse(await readFile(file, 'utf8'));
  for (const content of ['broken json', { ...stored, key: 'wrong' }, { ...stored, data: { body: 123 } }]) {
    await writeFile(file, typeof content === 'string' ? content : JSON.stringify(content));
    const loadAgain = await restartedLoader();
    await loadAgain('lucide', 'star', apiBase);
  }
  assert.equal(calls, 4);
});

test('unwritable cache locations still allow memory caching and rendering', async (context) => {
  const file = join(process.env.PROSEFLY_ICON_CACHE_DIR, 'not-a-directory');
  await writeFile(file, 'existing file');
  process.env.PROSEFLY_ICON_CACHE_DIR = file;
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url) => { calls++; return responseFor(url); });
  const first = await loadIconCollection('lucide', 'star', apiBase);
  const second = await loadIconCollection('lucide', 'star', apiBase);
  assert.equal(first.icons.star.body, second.icons.star.body);
  assert.equal(calls, 1);
  assert.equal(await readFile(file, 'utf8'), 'existing file');
});
