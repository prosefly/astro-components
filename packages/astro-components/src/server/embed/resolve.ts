import { loadPage, normalizeUrl } from './http.js';
import { resolveOEmbed } from './oembed.js';
import { resolveOpenGraph } from './opengraph.js';
import { findSchemaProvider, resolveSchema } from './schema.js';
import type { EmbedData, EmbedInput, EmbedKind, ResolveOptions } from './types.js';

export async function resolveEmbed(
  input: EmbedInput,
  options: ResolveOptions = {},
): Promise<EmbedData> {
  const url = normalizeUrl(input.url);

  if (input.fetch === false || isCompleteEmbed(input)) {
    return fromProps(input, url);
  }

  const fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) return fromProps(input, url);

  const oembed = await resolveOEmbed(url, fetcher);
  if (oembed) return merge(oembed, input);

  try {
    const html = await loadPage(url, fetcher);

    if (findSchemaProvider(url)) {
      const schema = resolveSchema(html, url);
      if (schema) return merge(schema, input);
    }

    return merge(resolveOpenGraph(html, url), input);
  } catch {
    return fromProps(input, url);
  }
}

export function isCompleteEmbed(input: EmbedInput): boolean {
  if (!input.title) return false;

  switch (input.kind) {
    case 'review':
      return Boolean(input.rating);
    case 'product':
      return Boolean(input.price);
    case 'application':
    case 'movie':
    case 'book':
    case 'link':
      return true;
    case 'auto':
    case undefined:
      return Boolean(
        input.description ||
        input.image ||
        input.siteName ||
        input.author ||
        input.rating ||
        input.price,
      );
  }
}

function fromProps(input: EmbedInput, url: URL): EmbedData {
  return {
    source: 'props',
    url: url.href,
    kind: input.kind && input.kind !== 'auto' ? input.kind : inferKind(input),
    title: input.title,
    description: input.description,
    image: input.image,
    siteName: input.siteName,
    author: input.author,
    rating: input.rating,
    price: input.price,
  };
}

function merge(data: EmbedData, input: EmbedInput): EmbedData {
  return {
    ...data,
    url: input.url,
    kind: input.kind && input.kind !== 'auto' ? input.kind : data.kind,
    title: input.title ?? data.title,
    description: input.description ?? data.description,
    image: input.image ?? data.image,
    siteName: input.siteName ?? data.siteName,
    author: input.author ?? data.author,
    rating: input.rating ?? data.rating,
    price: input.price ?? data.price,
  };
}

function inferKind(input: EmbedInput): EmbedKind {
  if (input.price) return 'product';
  if (input.rating) return 'review';
  return 'link';
}
