# @prosefly/astro-components

Reusable Astro components for MDX content.

## Install

Install the package in an Astro v7 project:

```sh
pnpm add @prosefly/astro-components
```

If your site renders `.mdx` pages, make sure MDX is configured in Astro first.
[Dahlia](https://astro-theme-dahlia.prosefly.dev/) and
[Lotus](https://astro-theme-lotus.prosefly.dev/) projects already include MDX,
the shared integration, icon preloading, and their docs shell.

```astro
---
import { Callout } from '@prosefly/astro-components';
---

<Callout type="tip" title="Reusable">
  Package components use Prosefly CSS custom properties with built-in fallbacks.
</Callout>
```

Full documentation is available at
[prosefly.dev/docs/astro-components](https://prosefly.dev/docs/astro-components/).

For a standalone Astro site, the shared integration configures icon preloading,
the shared Markdown transforms, and image-gallery assets together:

```ts
import { defineConfig } from 'astro/config';
import components from '@prosefly/astro-components/integration';

export default defineConfig({
  integrations: [components({
    icons: { preload: ['lucide:star'] },
  })],
});
```

## Exports

The main entry exports:

- `AccordionItem` and `Accordions`
- `Badge`
- `Callout`
- `Card` and `CardGrid`
- `FileTree`
- `Icon`
- `Steps`
- `TabItem` and `Tabs`

The `@prosefly/astro-components/integration` entry exports the `components()`
Astro integration and its `ComponentsIntegrationOptions` type.

The markdown entry exports:

- `rehypeImageGallery`
- `remarkPackageManagerTabs`

## Advanced icon-only setup

Use the `@prosefly/astro-components/integration` entry for the usual setup. The
standalone `@prosefly/astro-components/icon` entry remains available when a
project wants only Iconify preloading without Markdown transforms or the full
[Dahlia](https://astro-theme-dahlia.prosefly.dev/) or
[Lotus](https://astro-theme-lotus.prosefly.dev/) theme:

```ts
import { defineConfig } from 'astro/config';
import proseflyIcon from '@prosefly/astro-components/icon';

export default defineConfig({
  integrations: [
    proseflyIcon({
      preload: ['lucide:star', 'simple-icons:github'],
    }),
  ],
});
```

The integration can scan `src/**/*.astro`, `src/**/*.md`, and `src/**/*.mdx`
for static icon usage. Set `scan: false` to disable that behavior or `apiBase`
to point at an internal Iconify-compatible endpoint.

## Independent Markdown transforms

Use `@prosefly/astro-components/integration` for the normal Markdown setup. The
`@prosefly/astro-components/markdown` entry remains available for advanced
manual processor composition:

```ts
import { defineConfig } from 'astro/config';
import { rehypeImageGallery, remarkPackageManagerTabs } from '@prosefly/astro-components/markdown';

export default defineConfig({
  markdown: {
    remarkPlugins: [remarkPackageManagerTabs],
    rehypePlugins: [rehypeImageGallery],
  },
});
```

`remarkPackageManagerTabs` recognizes common `npm` commands and can generate
tabs for Node and Python package managers. `rehypeImageGallery` turns paragraphs
that contain only images into gallery figures. Dahlia and Lotus enable both
transforms through the shared integration by default.

When using `components()`, gallery styles and runtime are injected
automatically. If you configure `rehypeImageGallery` through the standalone
`/markdown` entry instead, import the image gallery runtime once in the page
shell:

```astro
---
import '@prosefly/astro-components/markdown/image-gallery.css';
---

<script>
  import '@prosefly/astro-components/markdown/image-gallery.js';
</script>
```

## Independent Expressive Code plugin

Expressive Code is intentionally separate from `components()`. Install
`astro-expressive-code` and register
`expressiveCodeHeaderIcons()` in its `plugins` option:

```ts
import astroExpressiveCode from 'astro-expressive-code';
import { expressiveCodeHeaderIcons } from '@prosefly/astro-components/expressive-code';

export default {
  integrations: [
    astroExpressiveCode({
      plugins: [expressiveCodeHeaderIcons()],
    }),
  ],
};
```

Pass `{ apiBase: 'https://example.com' }` to use an Iconify-compatible endpoint
for code-header icons. Dahlia and Lotus already configure this plugin; do not
register it a second time in those themes. See the
[Expressive Code guide](https://prosefly.dev/docs/astro-components/expressive-code/)
for standalone and combined examples.

The `/expressive-code` entry publicly exports only
`expressiveCodeHeaderIcons` and the `ExpressiveCodeHeaderIconsOptions` type.
The icon and language-label helpers used by the plugin are internal.

## Styling

Consumers can theme the components with `--pf-*` custom properties:

- `--pf-text-strong`
- `--pf-text`
- `--pf-text-muted`
- `--pf-background`
- `--pf-surface`
- `--pf-accent`
- `--pf-accent-soft`
- `--pf-accent-contrast`
- `--pf-{info|success|warning|danger}`
- `--pf-{info|success|warning|danger}-soft`
- `--pf-{info|success|warning|danger}-ink`
- `--pf-{info|success|warning|danger}-contrast`
- `--pf-callout-{note|tip|warning|danger}-{color|ink|bg}`
- `--pf-border-subtle`
- `--pf-font-sans`
- `--pf-font-mono`
- `--pf-radius-sm`
- `--pf-radius-md`
- `--pf-radius-lg`
- `--pf-radius-full`
