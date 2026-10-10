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

## Shared integration

For a standalone Astro site, register
`@prosefly/astro-components/integration` to configure icon preloading, shared
Markdown transforms, and image-gallery assets together:

```ts
import { defineConfig } from 'astro/config';
import proseflyComponents from '@prosefly/astro-components/integration';

export default defineConfig({
  integrations: [proseflyComponents()],
});
```

## Exports

The main entry exports:

- `AccordionItem` and `Accordions`
- `AudioPlayer`
- `Badge`
- `Callout`
- `Card` and `CardGrid`
- `FileTree`
- `Icon`
- `ImageGallery`
- `Steps`
- `TabItem` and `Tabs`
- `VideoPlayer`

The `/integration` entry exports the `proseflyComponents()` Astro integration and its
`ComponentsIntegrationOptions` type.

The markdown entry exports:

- `rehypeMermaid`
- `rehypeVideoPlayer` (opt-in)
- `remarkImageGallery`
- `remarkPackageManagerTabs`

## Advanced icon-only setup

Use `/integration` for the usual setup. The standalone
`@prosefly/astro-components/icon` entry remains available when a project wants
only Iconify preloading without Markdown transforms or the full Dahlia or Lotus
theme:

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

Use `/integration` for the normal Markdown setup. It enables image galleries
in `.mdx` files; ordinary `.md` files are unchanged. The
`@prosefly/astro-components/markdown` entry remains available for advanced MDX
processor composition:

```ts
import { defineConfig } from 'astro/config';
import {
  rehypeMermaid,
  remarkImageGallery,
  remarkPackageManagerTabs,
  unified,
} from '@prosefly/astro-components/markdown';

export default defineConfig({
  markdown: {
    syntaxHighlight: {
      type: 'shiki',
      excludeLangs: ['math', 'mermaid'],
    },
    processor: unified({
      remarkPlugins: [remarkImageGallery, remarkPackageManagerTabs],
      rehypePlugins: [rehypeMermaid],
    }),
  },
});
```

`remarkPackageManagerTabs` recognizes common `npm` commands and can generate
tabs for Node and Python package managers. `remarkImageGallery` is an MDX-only
transform that preserves the original image nodes for Astro optimization and
renders the `ImageGallery` component with page-owned CSS and runtime. No manual
asset imports are required. `rehypeMermaid` renders `mermaid` code blocks as
static SVG; direct use requires excluding `mermaid` from Astro syntax
highlighting. Dahlia and Lotus enable these transforms through the shared
integration by default.

`VideoPlayer` loops short clips silently while visible and uses native controls
for long videos. Enable automatic MDX video-figure conversion explicitly with
`proseflyComponents({ markdown: { videoPlayer: true } })`, or register
`rehypeVideoPlayer` in an existing unified processor. Both accept
`{ shortVideoSeconds: 30, labels: { play: 'Play' } }` configuration (via
`markdown.videoPlayer` for the integration). HTML attributes, sources, tracks,
and rich captions are preserved, and no media is fetched at build time.
Ordinary Markdown, audio, and mixed-content figures are unchanged.

## Independent Expressive Code plugin

Expressive Code is intentionally separate from `proseflyComponents()`. Install
`astro-expressive-code` and register
`expressiveCodeHeaderIcons()` in its `plugins` option:

```sh
pnpm add astro-expressive-code
```

```ts
import { defineConfig } from 'astro/config';
import astroExpressiveCode from 'astro-expressive-code';
import { expressiveCodeHeaderIcons } from '@prosefly/astro-components/expressive-code';

export default defineConfig({
  integrations: [
    astroExpressiveCode({
      plugins: [expressiveCodeHeaderIcons()],
    }),
  ],
});
```

Pass `{ apiBase: 'https://example.com' }` to use an Iconify-compatible endpoint
for code-header icons. Dahlia and Lotus already configure this plugin; do not
register it a second time in those themes.

The `/expressive-code` entry publicly exports only
`expressiveCodeHeaderIcons` and the `ExpressiveCodeHeaderIconsOptions` type.
The icon and language-label helpers used by the plugin are internal.

## Local Development And Publishing

Workspace exports point to `src`, so `pnpm dev` runs the documentation site
directly against the components and TypeScript source with hot reload. It does
not require a package build first. Local site builds also consume source.

`pnpm test` builds and tests `dist`, then packs the package and verifies its
published entry points. `pnpm pack` and `pnpm publish` override `exports` and
`types` using `publishConfig`; only `dist`, the README, and license are shipped.
The `prepack` hook builds the package automatically.

Use pnpm to pack or publish from the source checkout. If publishing with npm
(for example, for trusted publishing), first create a tarball with `pnpm pack`,
then run `npm publish ./prosefly-astro-components-<version>.tgz`. Do not run
`npm publish` directly against the source directory: npm does not apply these
manifest overrides.

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
