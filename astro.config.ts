import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import lotus from "@prosefly/astro-theme-lotus";

const componentsSourcePath = (entry: string) =>
  fileURLToPath(
    new URL(`./packages/astro-components/src/${entry}`, import.meta.url),
  );
// Render workspace components from source during development so Vite can apply HMR.
const useComponentsSource = process.env.NODE_ENV !== "production";

export default defineConfig({
  integrations: [lotus()],
  vite: useComponentsSource
    ? {
        resolve: {
          alias: [
            {
              find: /^@prosefly\/astro-components\/expressive-code$/,
              replacement: componentsSourcePath("expressive-code/index.ts"),
            },
            {
              find: /^@prosefly\/astro-components\/integration$/,
              replacement: componentsSourcePath("integration.ts"),
            },
            {
              find: /^@prosefly\/astro-components\/markdown$/,
              replacement: componentsSourcePath("markdown/index.ts"),
            },
            {
              find: /^@prosefly\/astro-components\/icon$/,
              replacement: componentsSourcePath("icon/index.ts"),
            },
            {
              find: /^@prosefly\/astro-components$/,
              replacement: componentsSourcePath("index.ts"),
            },
          ],
        },
      }
    : undefined,
});
