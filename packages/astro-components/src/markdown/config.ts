import { isUnifiedProcessor, unified } from '@astrojs/markdown-remark';
import type { AstroConfig } from 'astro';
import type { RehypePlugins, RemarkPlugins } from '@astrojs/markdown-remark';
import { remarkCalloutDirectives } from './callout-directives.js';
import { remarkImageGallery } from './image-gallery.js';
import { rehypeMermaid } from './mermaid.js';
import { remarkPackageManagerTabs } from './package-manager-tabs.js';

/** Options for the transforms owned by the components integration. */
export interface MarkdownOptions {
  calloutDirectives?: false;
  packageManagerTabs?: false;
  imageGallery?: false;
  mermaid?: false;
  /** Theme remark plugins that run before the component transforms. */
  remarkPluginsBeforeTransforms?: RemarkPlugins;
  /** Theme remark plugins that run after the component transforms. */
  remarkPluginsAfterTransforms?: RemarkPlugins;
  /** Theme rehype plugins that run before the component transforms. */
  rehypePluginsBeforeTransforms?: RehypePlugins;
  /** Theme rehype plugins that run after the component transforms. */
  rehypePluginsAfterTransforms?: RehypePlugins;
}

const COMPONENTS_MARKDOWN_MARKER = Symbol('prosefly:astro-components');
type MarkedProcessor = AstroConfig['markdown']['processor'] & {
  [COMPONENTS_MARKDOWN_MARKER]?: true;
};

function isAstroDefaultProcessor(
  processor: AstroConfig['markdown']['processor'] | undefined,
): boolean {
  return processor?.name === 'satteri';
}

export function hasComponentsMarkdownTransforms(
  processor: AstroConfig['markdown']['processor'] | undefined,
): boolean {
  return Boolean(
    processor &&
    isUnifiedProcessor(processor) &&
    (processor as MarkedProcessor)[COMPONENTS_MARKDOWN_MARKER] === true,
  );
}

/**
 * Build the shared unified processor while retaining Astro's existing options.
 * Astro's built-in `satteri` processor is replaced with unified; a custom
 * non-unified processor is left untouched because its plugin API is
 * intentionally outside Astro's public integration contract.
 */
export function resolveMarkdownConfig(
  options: MarkdownOptions = {},
  markdownConfig: Partial<AstroConfig['markdown']> = {},
): Partial<AstroConfig['markdown']> {
  const existingProcessor = markdownConfig.processor;

  if (
    existingProcessor &&
    !isUnifiedProcessor(existingProcessor) &&
    !isAstroDefaultProcessor(existingProcessor)
  ) {
    return markdownConfig;
  }

  const unifiedOptions = existingProcessor && isUnifiedProcessor(existingProcessor)
    ? existingProcessor.options
    : undefined;
  const userRemarkPlugins = unifiedOptions?.remarkPlugins ?? markdownConfig.remarkPlugins ?? [];
  const userRehypePlugins = unifiedOptions?.rehypePlugins ?? markdownConfig.rehypePlugins ?? [];
  const remarkPlugins: RemarkPlugins = [
    ...(options.remarkPluginsBeforeTransforms ?? []),
    ...(options.calloutDirectives === false ? [] : [
      remarkCalloutDirectives,
    ]),
    ...userRemarkPlugins,
    ...(options.packageManagerTabs === false ? [] : [remarkPackageManagerTabs]),
    ...(options.imageGallery === false ? [] : [remarkImageGallery]),
    ...(options.remarkPluginsAfterTransforms ?? []),
  ];
  const rehypePlugins: RehypePlugins = [
    ...(options.rehypePluginsBeforeTransforms ?? []),
    ...userRehypePlugins,
    ...(options.mermaid === false ? [] : [rehypeMermaid]),
    ...(options.rehypePluginsAfterTransforms ?? []),
  ];

  const processor = unified({
    remarkPlugins,
    rehypePlugins,
    remarkRehype: unifiedOptions?.remarkRehype ?? markdownConfig.remarkRehype,
    gfm: unifiedOptions?.gfm ?? markdownConfig.gfm,
    smartypants: unifiedOptions?.smartypants ?? markdownConfig.smartypants,
  });
  Object.defineProperty(processor, COMPONENTS_MARKDOWN_MARKER, {
    configurable: false,
    enumerable: false,
    value: true,
  });

  return {
    ...markdownConfig,
    processor,
    ...(options.mermaid === false ? {} : {
      syntaxHighlight: excludeMermaidFromHighlighting(markdownConfig.syntaxHighlight),
    }),
  };
}

function excludeMermaidFromHighlighting(
  syntaxHighlight: AstroConfig['markdown']['syntaxHighlight'] | undefined,
): AstroConfig['markdown']['syntaxHighlight'] | undefined {
  if (syntaxHighlight === false) return false;

  if (typeof syntaxHighlight === 'string') {
    return {
      type: syntaxHighlight,
      excludeLangs: ['mermaid'],
    };
  }

  const excludeLangs = syntaxHighlight?.excludeLangs ?? (
    syntaxHighlight === undefined ? ['math'] : []
  );

  return {
    ...syntaxHighlight,
    type: syntaxHighlight?.type ?? 'shiki',
    excludeLangs: [...new Set([...excludeLangs, 'mermaid'])],
  };
}
