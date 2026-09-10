import { remember } from './cache.js';
import type { Fetcher } from './types.js';

const PAGE_TTL = 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT = 8_000;

export function normalizeUrl(value: string): URL {
  const url = new URL(value);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('Embed URLs must use http or https.');
  }

  if (url.username || url.password) {
    throw new TypeError('Embed URLs cannot contain credentials.');
  }

  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || ['fbclid', 'gclid'].includes(key)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url;
}

export function loadPage(url: URL, fetcher: Fetcher): Promise<string> {
  return remember(`page:${url.href}`, PAGE_TTL, async () => {
    const response = await fetchWithTimeout(fetcher, url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Prosefly Embed/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Unable to load embed metadata (${response.status}).`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('The embed URL did not return an HTML document.');
    }

    return readText(response, MAX_RESPONSE_BYTES);
  }, 5 * 60 * 1000);
}

export async function loadJson(
  url: URL,
  fetcher: Fetcher,
): Promise<Record<string, unknown>> {
  const response = await fetchWithTimeout(fetcher, url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Prosefly Embed/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to load oEmbed metadata (${response.status}).`);
  }

  const body = await readText(response, MAX_RESPONSE_BYTES);
  const value: unknown = JSON.parse(body);

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('The oEmbed endpoint returned an invalid response.');
  }

  return value as Record<string, unknown>;
}

async function fetchWithTimeout(
  fetcher: Fetcher,
  url: URL,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    return await fetcher(url, { ...init, redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readText(response: Response, limit: number): Promise<string> {
  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let output = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('The embed metadata response was too large.');
    }

    output += decoder.decode(value, { stream: true });
  }

  return output + decoder.decode();
}
