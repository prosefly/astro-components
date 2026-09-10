export type EmbedKind =
  | 'link'
  | 'application'
  | 'product'
  | 'movie'
  | 'book'
  | 'review';

export interface Rating {
  value: number;
  best?: number;
  worst?: number;
  count?: number;
}

export interface PriceAmount {
  amount: number;
  currency?: string;
  availability?: string;
}

export interface PriceRange {
  low: number;
  high: number;
  currency?: string;
  availability?: string;
}

export type Price = PriceAmount | PriceRange;

export interface EmbedInput {
  url: string;
  kind?: 'auto' | EmbedKind;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
  rating?: Rating;
  price?: Price;
  /** Disable remote metadata resolution, even when the supplied props are incomplete. */
  fetch?: boolean;
}

export type EmbedSource = 'props' | 'oembed' | 'schema' | 'opengraph';

export interface EmbedData {
  source: EmbedSource;
  url: string;
  kind: EmbedKind;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
  rating?: Rating;
  price?: Price;
  provider?: string;
  html?: string;
  embedType?: 'photo' | 'video' | 'link' | 'rich';
  width?: number;
  height?: number;
}

export type Fetcher = typeof globalThis.fetch;

export interface ResolveOptions {
  fetch?: Fetcher;
}
