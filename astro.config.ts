import { defineConfig } from 'astro/config';
import lotus from '@prosefly/astro-theme-lotus';
import {
  remarkCalloutDirectives,
  unified,
} from '@prosefly/astro-components/markdown';

export default defineConfig({
  integrations: [lotus()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkCalloutDirectives],
    }),
  },
});
