import { defineConfig } from 'astro/config';
import proseflyComponents from '@prosefly/astro-components/integration';
import { unified } from '@prosefly/astro-components/markdown';

export default defineConfig({
  markdown: { processor: unified() },
  integrations: [proseflyComponents({ icons: false })],
});
