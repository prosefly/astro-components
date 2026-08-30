import type { AstroIntegration } from 'astro';
import { isUnifiedProcessor } from '@astrojs/markdown-remark';
import { createIconIntegration, setupIcons, type IconIntegrationOptions } from './icon/index.js';
import {
  hasComponentsMarkdownTransforms,
  resolveMarkdownConfig,
  type MarkdownOptions,
} from './markdown/config.js';

export const COMPONENTS_INTEGRATION_NAME = '@prosefly/astro-components';

export interface ComponentsIntegrationOptions {
  icons?: false | IconIntegrationOptions;
  markdown?: false | MarkdownOptions;
}

/** Configure shared Astro Components features for a site. */
export default function components(
  options: ComponentsIntegrationOptions = {},
): AstroIntegration {
  return {
    name: COMPONENTS_INTEGRATION_NAME,
    hooks: {
      'astro:config:setup': async (context) => {
        const registrations = context.config.integrations.filter(
          (integration) => integration.name === COMPONENTS_INTEGRATION_NAME,
        );

        if (registrations.length > 1) {
          throw new Error(
            `The ${COMPONENTS_INTEGRATION_NAME} integration is registered ${registrations.length} times. Register components() only once.`,
          );
        }

        if (options.icons !== false) {
          await setupIcons(options.icons ?? {}, context);
        }

        if (options.markdown !== false) {
          const markdownProcessor = context.config.markdown.processor;
          const supportsTransforms =
            !markdownProcessor ||
            isUnifiedProcessor(markdownProcessor) ||
            markdownProcessor.name === 'satteri';
          if (!hasComponentsMarkdownTransforms(markdownProcessor)) {
            context.updateConfig({
              markdown: resolveMarkdownConfig(options.markdown ?? {}, context.config.markdown),
            });
          }

          if (
            options.markdown?.imageGallery !== false &&
            supportsTransforms
          ) {
            context.injectScript(
              'page',
              "import '@prosefly/astro-components/markdown/image-gallery.css'; import '@prosefly/astro-components/markdown/image-gallery.js';",
            );
          }
        }
      },
    },
  };
}

export { createIconIntegration };
