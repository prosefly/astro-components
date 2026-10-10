import { defineConfig } from "astro/config";
import lotus from "@prosefly/astro-theme-lotus";
import { rehypeVideoPlayer, unified } from "@prosefly/astro-components/markdown";

export default defineConfig({
  markdown: {
    processor: unified({ rehypePlugins: [rehypeVideoPlayer] }),
  },
  integrations: [lotus()],
});
