import { defineConfig } from 'astro/config';
import lotus from '@prosefly/astro-theme-lotus';
import {
  remarkCalloutDirectives,
  unified,
} from '@prosefly/astro-components/markdown';
import themeConfig from './src/theme.config';

export default defineConfig({
  integrations: [lotus(themeConfig)],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkCalloutDirectives],
    }),
  },
});
