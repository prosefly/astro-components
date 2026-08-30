import { defineConfig } from 'astro/config';
import components from '@prosefly/astro-components/integration';
import { unified } from '@prosefly/astro-components/markdown';

export default defineConfig({
  markdown: { processor: unified() },
  integrations: [components({ icons: false })],
});
