import { attribute, elements, parseHtml, text } from './html.js';
import type { EmbedData, EmbedKind } from './types.js';

export function resolveOpenGraph(html: string, url: URL): EmbedData {
  const root = parseHtml(html);
  const metadata = new Map<string, string>();

  for (const meta of elements(root, 'meta')) {
    const key = (attribute(meta, 'property') ?? attribute(meta, 'name'))?.toLowerCase();
    const content = attribute(meta, 'content')?.trim();
    if (key && content && !metadata.has(key)) metadata.set(key, content);
  }

  const documentTitle = elements(root, 'title').map(text).find(Boolean)?.trim();
  const title = metadata.get('og:title') ?? metadata.get('twitter:title') ?? documentTitle;
  const description = metadata.get('og:description') ?? metadata.get('twitter:description') ?? metadata.get('description');
  const image = absoluteUrl(metadata.get('og:image') ?? metadata.get('twitter:image'), url);
  const canonical = elements(root, 'link').find((link) =>
    attribute(link, 'rel')?.split(/\s+/).includes('canonical'),
  );
  const resolvedUrl =
    absoluteUrl(metadata.get('og:url'), url) ??
    absoluteUrl(canonical ? attribute(canonical, 'href') : undefined, url) ??
    url.href;

  return {
    source: 'opengraph',
    url: resolvedUrl,
    kind: kindForType(metadata.get('og:type')),
    title,
    description,
    image,
    siteName: metadata.get('og:site_name'),
    author: metadata.get('article:author') ?? metadata.get('author'),
  };
}

function kindForType(value: string | undefined): EmbedKind {
  if (value === 'product') return 'product';
  if (value?.includes('book')) return 'book';
  if (value?.includes('movie') || value?.includes('video')) return 'movie';
  return 'link';
}

function absoluteUrl(value: string | undefined, base: URL): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}
