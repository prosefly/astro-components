import { attribute, elements, parseHtml, text } from './html.js';
import type { EmbedData, EmbedKind, Price, Rating } from './types.js';

interface Provider {
  id: string;
  name: string;
  match(url: URL): boolean;
  types: string[];
  kind?: EmbedKind;
  authorProperty?: string;
  normalizeImage?(image: string): string;
}

const providers: Provider[] = [
  {
    id: 'apple-app-store',
    name: 'App Store',
    match: (url) => hostMatches(url.hostname, 'apps.apple.com'),
    types: ['SoftwareApplication', 'MobileApplication', 'Product'],
    kind: 'application',
    normalizeImage: (image) => image.replace('/1200x630wa.png', '/630x630w.png'),
  },
  {
    id: 'google-play',
    name: 'Google Play',
    match: (url) => hostMatches(url.hostname, 'play.google.com') && url.pathname.startsWith('/store/apps/'),
    types: ['SoftwareApplication', 'MobileApplication', 'Product'],
    kind: 'application',
  },
  {
    id: 'product-hunt',
    name: 'Product Hunt',
    match: (url) => hostMatches(url.hostname, 'producthunt.com') && url.pathname.startsWith('/products/'),
    types: ['WebApplication', 'Product'],
    kind: 'application',
  },
  {
    id: 'rotten-tomatoes',
    name: 'Rotten Tomatoes',
    match: (url) =>
      hostMatches(url.hostname, 'rottentomatoes.com') &&
      (url.pathname.startsWith('/m/') || url.pathname.startsWith('/tv/')),
    types: ['Movie', 'TVSeries', 'TVEpisode'],
    kind: 'movie',
    authorProperty: 'director',
  },
  {
    id: 'letterboxd',
    name: 'Letterboxd',
    match: (url) => hostMatches(url.hostname, 'letterboxd.com') && url.pathname.startsWith('/film/'),
    types: ['Movie'],
    kind: 'movie',
    authorProperty: 'director',
  },
];

export function findSchemaProvider(url: URL): Provider | undefined {
  return providers.find((provider) => provider.match(url));
}

export function resolveSchema(html: string, url: URL): EmbedData | undefined {
  const provider = findSchemaProvider(url);
  if (!provider) return undefined;

  const entities = readEntities(html);
  const entity = selectEntity(entities, provider, url);
  if (!entity) return undefined;

  const type = entityTypes(entity)[0];
  const item = recordValue(entity.itemReviewed);
  const title = stringValue(entity.name) ?? stringValue(entity.headline) ?? stringValue(item?.name);
  const image = imageValue(entity.image, url) ?? imageValue(item?.image, url);

  return {
    source: 'schema',
    url: absoluteUrl(stringValue(entity.url), url) ?? url.href,
    kind: provider.kind ?? kindForType(type),
    title,
    description:
      stringValue(entity.description) ??
      stringValue(entity.reviewBody) ??
      stringValue(item?.description),
    image: image && provider.normalizeImage ? provider.normalizeImage(image) : image,
    siteName: provider.name,
    author: names(
      (provider.authorProperty ? entity[provider.authorProperty] : undefined) ??
      entity.author ??
      entity.creator,
    ),
    rating: ratingValue(entity.aggregateRating ?? entity.reviewRating),
    price: priceValue(entity.offers),
    provider: provider.id,
  };
}

function readEntities(html: string): Record<string, unknown>[] {
  const root = parseHtml(html);
  const entities: Record<string, unknown>[] = [];

  for (const script of elements(root, 'script')) {
    if (attribute(script, 'type')?.toLowerCase() !== 'application/ld+json') continue;

    const source = normalizeJsonLd(text(script));
    if (!source) continue;

    try {
      const value: unknown = JSON.parse(source);
      appendEntities(value, entities);
    } catch {
      // A broken JSON-LD block should not prevent other metadata fallbacks.
    }
  }

  return entities;
}

function normalizeJsonLd(value: string): string {
  return value
    .trim()
    .replace(/^<!--/, '')
    .replace(/-->$/, '')
    .replace(/^\/\*\s*<!\[CDATA\[\s*\*\//, '')
    .replace(/\/\*\s*\]\]>\s*\*\/$/, '')
    .trim();
}

function appendEntities(value: unknown, entities: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => appendEntities(item, entities));
    return;
  }

  const entity = recordValue(value);
  if (!entity) return;

  if (entity['@type']) entities.push(entity);
  appendEntities(entity['@graph'], entities);
}

function selectEntity(
  entities: Record<string, unknown>[],
  provider: Provider,
  url: URL,
): Record<string, unknown> | undefined {
  return entities
    .map((entity) => ({ entity, score: entityScore(entity, provider, url) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.entity;
}

function entityScore(entity: Record<string, unknown>, provider: Provider, url: URL): number {
  const matchingTypes = entityTypes(entity)
    .map((type) => provider.types.indexOf(type))
    .filter((index) => index >= 0);
  if (matchingTypes.length === 0) return -1;

  let score = provider.types.length - Math.min(...matchingTypes);
  const entityUrl = stringValue(entity.url);
  const mainEntityUrl = stringValue(recordValue(entity.mainEntityOfPage)?.['@id']) ?? stringValue(entity.mainEntityOfPage);

  if (urlsMatch(entityUrl, url)) score += 100;
  if (urlsMatch(mainEntityUrl, url)) score += 80;
  return score;
}

function entityTypes(entity: Record<string, unknown>): string[] {
  const value = entity['@type'];
  return (Array.isArray(value) ? value : [value])
    .filter((type): type is string => typeof type === 'string')
    .map((type) => type.split(/[/#]/).pop() ?? type);
}

function kindForType(type: string | undefined): EmbedKind {
  if (['SoftwareApplication', 'MobileApplication', 'WebApplication'].includes(type ?? '')) return 'application';
  if (type === 'Product') return 'product';
  if (['Movie', 'TVSeries', 'TVEpisode'].includes(type ?? '')) return 'movie';
  if (type === 'Book') return 'book';
  if (type === 'Review') return 'review';
  return 'link';
}

function ratingValue(value: unknown): Rating | undefined {
  const rating = recordValue(value);
  if (!rating) return undefined;

  const number = numericValue(rating.ratingValue);
  if (number === undefined) return undefined;

  return compact({
    value: number,
    best: numericValue(rating.bestRating),
    worst: numericValue(rating.worstRating),
    count: numericValue(rating.ratingCount) ?? numericValue(rating.reviewCount),
  });
}

function priceValue(value: unknown): Price | undefined {
  const offers = (Array.isArray(value) ? value : [value])
    .map(recordValue)
    .filter((offer): offer is Record<string, unknown> => Boolean(offer));
  const offer = offers.find((item) => entityTypes(item).includes('AggregateOffer')) ?? offers[0];
  if (!offer) return undefined;

  const specification = recordValue(offer.priceSpecification);
  const currency = stringValue(offer.priceCurrency) ?? stringValue(specification?.priceCurrency);
  const availability = schemaName(stringValue(offer.availability));
  const low = numericValue(offer.lowPrice);
  const high = numericValue(offer.highPrice);

  if (low !== undefined && high !== undefined) {
    return compact({ low, high, currency, availability });
  }

  const amount = numericValue(offer.price) ?? numericValue(specification?.price);
  return amount === undefined ? undefined : compact({ amount, currency, availability });
}

function imageValue(value: unknown, base: URL): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  const image = recordValue(first);
  const source =
    stringValue(first) ??
    stringValue(image?.url) ??
    stringValue(image?.contentUrl) ??
    stringValue(image?.['@id']);
  return absoluteUrl(source, base);
}

function names(value: unknown): string | undefined {
  const values = Array.isArray(value) ? value : [value];
  const resolved = values
    .map((item) => stringValue(item) ?? stringValue(recordValue(item)?.name))
    .filter((item): item is string => Boolean(item));
  return resolved.length > 0 ? resolved.join(', ') : undefined;
}

function absoluteUrl(value: string | undefined, base: URL): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function urlsMatch(value: string | undefined, target: URL): boolean {
  const resolved = absoluteUrl(value, target);
  if (!resolved) return false;
  const candidate = new URL(resolved);
  candidate.hash = '';
  const expected = new URL(target);
  expected.hash = '';
  return candidate.href === expected.href;
}

function schemaName(value: string | undefined): string | undefined {
  return value?.split(/[/#]/).pop();
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  const record = recordValue(value);
  return typeof record?.['@value'] === 'string' ? record['@value'].trim() : undefined;
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'string' && !/^\s*-?\d+(?:\.\d+)?\s*$/.test(value)) return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hostMatches(hostname: string, expected: string): boolean {
  return hostname === expected || hostname.endsWith(`.${expected}`);
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}
