import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  clearEmbedCache,
  isCompleteEmbed,
  resolveEmbed,
} from '../dist/server/embed/index.js';
import { clearMemoryCache } from '../dist/server/embed/cache.js';

process.env.PROSEFLY_EMBED_CACHE_DIR = join(
  tmpdir(),
  `prosefly-embed-test-${process.pid}`,
);

test.beforeEach(() => clearEmbedCache());
test.after(() => clearEmbedCache());

test('treats explicitly populated cards as complete', () => {
  assert.equal(isCompleteEmbed({ url: 'https://example.com', kind: 'link', title: 'Example' }), true);
  assert.equal(isCompleteEmbed({ url: 'https://example.com', kind: 'review', title: 'Example' }), false);
  assert.equal(
    isCompleteEmbed({
      url: 'https://example.com',
      kind: 'review',
      title: 'Example',
      rating: { value: 4.5, best: 5 },
    }),
    true,
  );
  assert.equal(isCompleteEmbed({ url: 'https://example.com', title: 'Example' }), false);
});

test('does not fetch metadata for complete props', async () => {
  const result = await resolveEmbed(
    {
      url: 'https://apps.apple.com/us/app/example/id1',
      kind: 'application',
      title: 'Example',
      price: { amount: 0, currency: 'USD' },
      rating: { value: 4.8, best: 5, count: 1200 },
    },
    { fetch: async () => assert.fail('complete props should not be fetched') },
  );

  assert.equal(result.source, 'props');
  assert.equal(result.kind, 'application');
  assert.deepEqual(result.price, { amount: 0, currency: 'USD' });
});

test('resolves supported oEmbed providers before page metadata', async () => {
  let calls = 0;
  const fetcher = async (input) => {
    calls += 1;
    const url = new URL(input);
    assert.equal(url.hostname, 'www.youtube.com');
    assert.equal(url.pathname, '/oembed');
    return Response.json({
      type: 'video',
      provider_name: 'YouTube',
      title: 'A video',
      width: 560,
      height: 315,
      cache_age: 3600,
      html: '<iframe src="https://www.youtube.com/embed/abc"></iframe>',
    });
  };

  const first = await resolveEmbed(
    { url: 'https://youtu.be/abc', title: 'Supplied title' },
    { fetch: fetcher },
  );
  const second = await resolveEmbed({ url: 'https://youtu.be/abc' }, { fetch: fetcher });

  assert.equal(first.source, 'oembed');
  assert.equal(first.provider, 'youtube');
  assert.equal(first.embedType, 'video');
  assert.equal(first.title, 'Supplied title');
  assert.equal(second.title, 'A video');
  assert.equal(calls, 1);
});

test('reuses persisted metadata after the memory cache is cleared', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return Response.json({
      type: 'video',
      provider_name: 'YouTube',
      title: 'A persisted video',
      cache_age: 3600,
      html: '<iframe src="https://www.youtube.com/embed/persisted"></iframe>',
    });
  };

  const input = { url: 'https://youtu.be/persisted' };
  const first = await resolveEmbed(input, { fetch: fetcher });
  clearMemoryCache();
  const second = await resolveEmbed(input, { fetch: fetcher });

  assert.equal(first.title, 'A persisted video');
  assert.equal(second.title, 'A persisted video');
  assert.equal(calls, 1);
});

test('normalizes X oEmbed HTML without provider scripts', async () => {
  const result = await resolveEmbed(
    { url: 'https://twitter.com/astrodotbuild/status/2034318549532000277' },
    {
      fetch: async (input) => {
        const endpoint = new URL(input);
        assert.equal(endpoint.hostname, 'publish.x.com');
        assert.equal(
          endpoint.searchParams.get('url'),
          'https://x.com/astrodotbuild/status/2034318549532000277',
        );
        return Response.json({
          type: 'rich',
          provider_name: 'X',
          html: '<blockquote class="twitter-tweet">A post</blockquote>\n<script async src="https://platform.twitter.com/widgets.js"></script>',
        });
      },
    },
  );

  assert.equal(result.source, 'oembed');
  assert.equal(result.provider, 'x');
  assert.equal(result.html, '<blockquote class="twitter-tweet">A post</blockquote>');
  assert.doesNotMatch(result.html, /<script/i);
});

test('normalizes Flickr oEmbed HTML without provider scripts', async () => {
  const result = await resolveEmbed(
    { url: 'https://www.flickr.com/photos/bees/2341623661/' },
    {
      fetch: async (input) => {
        const endpoint = new URL(input);
        assert.equal(endpoint.hostname, 'www.flickr.com');
        assert.equal(endpoint.pathname, '/services/oembed/');
        return Response.json({
          type: 'photo',
          provider_name: 'Flickr',
          title: 'ZB8T0193',
          html: '<a data-flickr-embed="true" href="https://www.flickr.com/photos/bees/2341623661/"><img src="https://live.staticflickr.com/example.jpg" alt="ZB8T0193"></a><script async src="https://embedr.flickr.com/assets/client-code.js"></script>',
        });
      },
    },
  );

  assert.equal(result.source, 'oembed');
  assert.equal(result.provider, 'flickr');
  assert.equal(result.embedType, 'photo');
  assert.match(result.html, /<img/);
  assert.doesNotMatch(result.html, /<script/i);
});

test('uses Schema.org only for selected websites', async () => {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Example App',
    description: 'A useful app.',
    image: 'https://is1-ssl.mzstatic.com/image/thumb/example/1200x630wa.png',
    author: { '@type': 'Organization', name: 'Example Inc.' },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.7',
      bestRating: '5',
      ratingCount: '42',
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };
  const html = `<!doctype html><html><head>
    <meta property="og:title" content="Fallback title">
    <script type="application/ld+json">${JSON.stringify(schema)}</script>
  </head></html>`;
  const fetcher = async () => new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

  const result = await resolveEmbed(
    { url: 'https://apps.apple.com/us/app/example/id1' },
    { fetch: fetcher },
  );

  assert.equal(result.source, 'schema');
  assert.equal(result.kind, 'application');
  assert.equal(result.title, 'Example App');
  assert.equal(
    result.image,
    'https://is1-ssl.mzstatic.com/image/thumb/example/630x630w.png',
  );
  assert.deepEqual(result.price, { amount: 0, currency: 'USD' });
  assert.deepEqual(result.rating, { value: 4.7, best: 5, count: 42 });
});

test('resolves Product Hunt applications from Schema.org', async () => {
  const schema = {
    '@context': 'https://schema.org',
    '@type': ['WebApplication', 'Product'],
    name: 'Notion',
    description: 'An all-in-one workspace.',
    image: 'https://ph-files.imgix.net/notion.png',
    author: [
      { '@type': 'Person', name: 'Maker One' },
      { '@type': 'Person', name: 'Maker Two' },
    ],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.83',
      bestRating: 5,
      worstRating: 1,
      ratingCount: 1396,
    },
  };
  const result = await resolveEmbed(
    { url: 'https://www.producthunt.com/products/notion' },
    { fetch: schemaFetcher(schema) },
  );

  assert.equal(result.source, 'schema');
  assert.equal(result.provider, 'product-hunt');
  assert.equal(result.kind, 'application');
  assert.equal(result.author, 'Maker One, Maker Two');
  assert.deepEqual(result.rating, { value: 4.83, best: 5, worst: 1, count: 1396 });
});

test('resolves Letterboxd movies from comment-wrapped Schema.org', async () => {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: 'Spirited Away',
    image: 'https://images.example.com/spirited-away.jpg',
    director: { '@type': 'Person', name: 'Hayao Miyazaki' },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: 4.43,
      bestRating: 5,
      worstRating: 0.5,
      ratingCount: 3986479,
    },
  };
  const result = await resolveEmbed(
    { url: 'https://letterboxd.com/film/spirited-away/' },
    { fetch: schemaFetcher(schema, { cdata: true }) },
  );

  assert.equal(result.source, 'schema');
  assert.equal(result.provider, 'letterboxd');
  assert.equal(result.kind, 'movie');
  assert.equal(result.author, 'Hayao Miyazaki');
  assert.deepEqual(result.rating, { value: 4.43, best: 5, worst: 0.5, count: 3986479 });
});

test('resolves Rotten Tomatoes movies and directors from Schema.org', async () => {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: 'Spirited Away',
    description: 'A young girl enters a world of spirits.',
    image: 'https://images.example.com/spirited-away.jpg',
    director: { '@type': 'Person', name: 'Hayao Miyazaki' },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: 96,
      bestRating: 100,
      worstRating: 0,
      ratingCount: 220,
    },
  };
  const result = await resolveEmbed(
    { url: 'https://www.rottentomatoes.com/m/spirited_away' },
    { fetch: schemaFetcher(schema) },
  );

  assert.equal(result.source, 'schema');
  assert.equal(result.provider, 'rotten-tomatoes');
  assert.equal(result.kind, 'movie');
  assert.equal(result.author, 'Hayao Miyazaki');
  assert.deepEqual(result.rating, { value: 96, best: 100, worst: 0, count: 220 });
});

test('ignores Schema.org on websites outside the allowlist and uses OpenGraph', async () => {
  const html = `<!doctype html><html><head>
    <meta property="og:title" content="OpenGraph title">
    <meta property="og:description" content="OpenGraph description">
    <script type="application/ld+json">{
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Schema product"
    }</script>
  </head></html>`;
  const result = await resolveEmbed(
    { url: 'https://example.com/item' },
    {
      fetch: async () => new Response(html, {
        headers: { 'content-type': 'text/html' },
      }),
    },
  );

  assert.equal(result.source, 'opengraph');
  assert.equal(result.title, 'OpenGraph title');
  assert.equal(result.kind, 'link');
});

test('falls back to supplied props when remote metadata fails', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return new Response('Unavailable', { status: 503 });
  };
  const first = await resolveEmbed(
    { url: 'https://example.com/item', title: 'Supplied title' },
    { fetch: fetcher },
  );
  const second = await resolveEmbed(
    { url: 'https://example.com/item', title: 'Supplied title' },
    { fetch: fetcher },
  );

  assert.equal(first.source, 'props');
  assert.equal(second.title, 'Supplied title');
  assert.equal(calls, 1);
});

function schemaFetcher(schema, options = {}) {
  const source = JSON.stringify(schema);
  const jsonLd = options.cdata ? `/* <![CDATA[ */${source}/* ]]> */` : source;
  const html = `<!doctype html><html><head>
    <script type="application/ld+json">${jsonLd}</script>
  </head></html>`;
  return async () => new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
