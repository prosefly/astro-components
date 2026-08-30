export { unified } from '@astrojs/markdown-remark';
export {
  expressiveCodeHeaderIcons,
  expressiveCodeHeaderIconNames,
  getExpressiveCodeHeaderIconNames,
  resolveCodeHeaderIcon,
} from '../expressive-code/header-icons.js';
export { rehypeImageGallery } from './image-gallery-plugin.js';
export { remarkCalloutDirectives } from './callout-directives.js';
export { remarkPackageManagerTabs } from './package-manager-tabs.js';
export {
  hasComponentsMarkdownTransforms,
  resolveMarkdownConfig,
} from './config.js';
export type { MarkdownOptions } from './config.js';
