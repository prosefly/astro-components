import { remember } from './cache.js';
import { attribute, elements, parseHtml } from './html.js';
import { loadJson } from './http.js';
import type { EmbedData, Fetcher } from './types.js';

const DEFAULT_TTL = 60 * 60 * 1000;
const MIN_TTL = 60 * 1000;
const MAX_TTL = 24 * 60 * 60 * 1000;

interface Provider {
  id: string;
  name: string;
  endpoint: string;
  match(url: URL): boolean;
  normalizeUrl?(url: URL): URL;
  normalizeHtml?(html: string): string;
  iframeHosts?: string[];
  scriptHosts?: string[];
}

interface Result {
  data?: EmbedData;
  ttl: number;
}

const providers: Provider[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    endpoint: 'https://www.youtube.com/oembed',
    match: (url) =>
      ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname),
    iframeHosts: ['youtube.com', 'youtube-nocookie.com'],
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    endpoint: 'https://vimeo.com/api/oembed.json',
    match: (url) => hostMatches(url.hostname, 'vimeo.com'),
    iframeHosts: ['player.vimeo.com'],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    endpoint: 'https://open.spotify.com/oembed',
    match: (url) => hostMatches(url.hostname, 'open.spotify.com') || hostMatches(url.hostname, 'spotify.link'),
    iframeHosts: ['open.spotify.com'],
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    endpoint: 'https://soundcloud.com/oembed',
    match: (url) => hostMatches(url.hostname, 'soundcloud.com') || hostMatches(url.hostname, 'on.soundcloud.com'),
    iframeHosts: ['w.soundcloud.com'],
  },
  {
    id: 'apple-podcasts',
    name: 'Apple Podcasts',
    endpoint: 'https://podcasts.apple.com/api/oembed',
    match: (url) => hostMatches(url.hostname, 'podcasts.apple.com'),
    iframeHosts: ['embed.podcasts.apple.com'],
  },
  {
    id: 'apple-music',
    name: 'Apple Podcasts',
    endpoint: '#apple-embed',
    match: (url) => hostMatches(url.hostname, 'music.apple.com'),
    iframeHosts: ['embed.music.apple.com'],
  },
  {
    id: 'x',
    name: 'X',
    endpoint: 'https://publish.x.com/oembed',
    match: (url) =>
      ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(url.hostname) &&
      /\/status\/\d+/.test(url.pathname),
    normalizeUrl: (url) => {
      const normalized = new URL(url);
      normalized.hostname = 'x.com';
      return normalized;
    },
    normalizeHtml: removeScripts,
  },
  {
    id: 'bluesky',
    name: 'Bluesky',
    endpoint: 'https://embed.bsky.app/oembed',
    match: (url) => hostMatches(url.hostname, 'bsky.app'),
    normalizeHtml: removeScripts,
  },
  {
    id: 'flickr',
    name: 'Flickr',
    endpoint: 'https://www.flickr.com/services/oembed/',
    match: (url) => hostMatches(url.hostname, 'flickr.com') || hostMatches(url.hostname, 'flic.kr'),
    normalizeHtml: removeScripts,
  },
];

export function findOEmbedProvider(url: URL): Provider | undefined {
  return providers.find((provider) => provider.match(url));
}

export function resolveOEmbed(url: URL, fetcher: Fetcher): Promise<EmbedData | undefined> {
  const provider = findOEmbedProvider(url);
  if (!provider) return Promise.resolve(undefined);

  if (provider.endpoint === "#apple-embed") {
    return new Promise((resolve) => {
      resolve(renderAppleEmbed(provider, url.href))
    })
  }

  const target = provider.normalizeUrl?.(url) ?? url;
  return remember(
    `oembed:${provider.id}:${target.href}`,
    (result: Result) => result.ttl,
    async (): Promise<Result> => {
      try {
        const endpoint = new URL(provider.endpoint);
        endpoint.searchParams.set('format', 'json');
        endpoint.searchParams.set('url', target.href);
        const response = await loadJson(endpoint, fetcher);
        const rawHtml = stringValue(response.html);
        const html = rawHtml
          ? stringValue(provider.normalizeHtml?.(rawHtml) ?? rawHtml)
          : undefined;

        if (html && !isAllowedHtml(html, provider)) {
          throw new Error(`The ${provider.name} oEmbed response contained an unexpected host.`);
        }

        const type = embedType(response.type);
        const data: EmbedData = {
          source: 'oembed',
          url: target.href,
          kind: 'link',
          title: stringValue(response.title),
          description: undefined,
          image: stringValue(response.thumbnail_url),
          author: stringValue(response.author_name),
          siteName: stringValue(response.provider_name) ?? provider.name,
          provider: provider.id,
          html,
          embedType: type,
          width: numberValue(response.width),
          height: numberValue(response.height),
        };

        return { data, ttl: cacheTtl(response.cache_age) };
      } catch {
        return { data: undefined, ttl: 5 * 60 * 1000 };
      }
    },
  ).then((result) => result.data);
}

function renderAppleEmbed(provider: Provider, url: string): EmbedData {
  const endpoint = new URL(url);
  endpoint.hostname = "embed." + endpoint.hostname
  const href = endpoint.href
  let height = 450
  if (href.includes("?i=")) {
    height = 190
  }
  const html = `<iframe src="${href}" frameborder="0" allowfullscreen width="100%" height="${height}"></iframe>`
  return {
    source: 'oembed',
    url: url,
    kind: 'link',
    provider: provider.id,
    html,
    embedType: "rich",
  };
}

function isAllowedHtml(html: string, provider: Provider): boolean {
  const root = parseHtml(html);

  for (const iframe of elements(root, 'iframe')) {
    const src = attribute(iframe, 'src');
    if (!src || !matchesAllowedHost(src, provider.iframeHosts ?? [])) return false;
  }

  for (const script of elements(root, 'script')) {
    const src = attribute(script, 'src');
    if (!src || !matchesAllowedHost(src, provider.scriptHosts ?? [])) return false;
  }

  return !/\son[a-z]+\s*=/i.test(html);
}

function matchesAllowedHost(value: string, hosts: string[]): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && hosts.some((host) => hostMatches(url.hostname, host));
  } catch {
    return false;
  }
}

function removeScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/\s*>/gi, '')
    .trim();
}

function hostMatches(hostname: string, expected: string): boolean {
  return hostname === expected || hostname.endsWith(`.${expected}`);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function embedType(value: unknown): EmbedData['embedType'] {
  return ['photo', 'video', 'link', 'rich'].includes(String(value))
    ? (String(value) as EmbedData['embedType'])
    : undefined;
}

function cacheTtl(value: unknown): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_TTL;
  return Math.min(MAX_TTL, Math.max(MIN_TTL, seconds * 1000));
}
