import { getIconData, iconToSVG } from '@iconify/utils';
import type {
  ExpressiveCodePlugin,
  PostprocessRenderedBlockContext,
} from '@expressive-code/core';
import {
  fileTreeComponentIconNames,
  getFileIcon,
  getFileIconForLanguage,
  getFileIconNames,
  type FileTreeIcon,
} from '../icon/file-tree-icons.js';
import {
  loadIconCollection,
  normalizeIconApiBase,
  parseIconName,
} from '../icon/data.js';

interface CodeHeaderIconBlock {
  language?: string;
  props?: {
    title?: string;
  };
}

type HastElement = PostprocessRenderedBlockContext['renderData']['blockAst'];
type HastElementContent = HastElement['children'][number];

export interface ExpressiveCodeHeaderIconsOptions {
  apiBase?: string;
}

export const expressiveCodeHeaderIconNames = [
  ...fileTreeComponentIconNames,
] as const;

export function expressiveCodeHeaderIcons(
  options: ExpressiveCodeHeaderIconsOptions = {},
): ExpressiveCodePlugin {
  const apiBase = normalizeIconApiBase(
    options.apiBase ?? 'https://api.iconify.design',
  );

  return {
    name: '@prosefly/astro-components/expressive-code/header-icons',
    baseStyles: `
      .frame .header .pf-code-header-icon {
        align-items: center;
        display: inline-flex;
        flex: 0 0 auto;
        justify-content: center;
        line-height: 0;
        margin-inline-end: 0.5rem;
      }

      .frame .header .pf-code-header-language {
        color: var(--ec-frm-edActTabFg);
        font-size: 0.8125rem;
        font-weight: 500;
        line-height: 1.25rem;
      }

      .frame.is-terminal .header .pf-code-header-language {
        color: var(--ec-frm-trmTtbFg);
      }

      .frame .header .pf-code-header-icon__svg {
        display: block;
        height: 1rem;
        width: 1rem;
      }

      .frame .header .pf-code-header-icon__svg--dark {
        display: none;
      }

      @at-root :root[data-theme='dark'] .expressive-code .pf-code-header-icon__svg--light {
        display: none;
      }

      @at-root :root[data-theme='dark'] .expressive-code .pf-code-header-icon__svg--dark {
        display: block;
      }

      @media (prefers-color-scheme: dark) {
        @at-root :root:is([data-theme='system'], :not([data-theme])) .expressive-code .pf-code-header-icon__svg--light {
          display: none;
        }

        @at-root :root:is([data-theme='system'], :not([data-theme])) .expressive-code .pf-code-header-icon__svg--dark {
          display: block;
        }
      }
    `,
    hooks: {
      postprocessRenderedBlock: async ({ codeBlock, renderData }) => {
        if (hasClassName(renderData.blockAst, 'is-terminal')) {
          return;
        }

        const header = findHeader(renderData.blockAst);

        if (!header || hasHeaderIcon(header)) {
          return;
        }

        const title = getCodeBlockTitle(codeBlock.props);
        const icon = resolveCodeHeaderIcon({
          language: codeBlock.language,
          props: {
            title,
          },
        });
        const iconNodes = await renderIconNodes(icon, apiBase);

        if (iconNodes.length === 0) {
          return;
        }

        header.children.unshift({
          children: iconNodes,
          properties: {
            ariaHidden: 'true',
            className: ['pf-code-header-icon'],
          },
          tagName: 'span',
          type: 'element',
        });

        const languageLabel = title
          ? undefined
          : getCodeBlockLanguageLabel(codeBlock.language);

        if (languageLabel) {
          header.children.splice(1, 0, {
            children: [{ type: 'text', value: languageLabel }],
            properties: {
              className: ['pf-code-header-language'],
            },
            tagName: 'span',
            type: 'element',
          });
        }
      },
    },
  };
}

export function resolveCodeHeaderIcon(
  codeBlock: CodeHeaderIconBlock,
): FileTreeIcon {
  const title = codeBlock.props?.title?.trim();

  if (title) {
    return getFileIcon(title.split('/').at(-1) ?? title);
  }

  return getFileIconForLanguage(codeBlock.language);
}

function findHeader(root: HastElement): HastElement | undefined {
  if (root.tagName === 'figcaption' && hasClassName(root, 'header')) {
    return root;
  }

  for (const child of root.children) {
    if (child.type !== 'element') {
      continue;
    }

    const header = findHeader(child);

    if (header) {
      return header;
    }
  }

  return undefined;
}

function hasHeaderIcon(header: HastElement): boolean {
  return header.children.some(
    (child) =>
      child.type === 'element' && hasClassName(child, 'pf-code-header-icon'),
  );
}

function hasClassName(element: HastElement, className: string): boolean {
  const value = element.properties?.className;

  return Array.isArray(value) && value.includes(className);
}

async function renderIconNodes(
  icon: FileTreeIcon,
  apiBase: string,
): Promise<HastElementContent[]> {
  if (icon.light && icon.dark) {
    const [lightIcon, darkIcon] = await Promise.all([
      renderIcon(icon.light, apiBase, [
        'pf-code-header-icon__svg',
        'pf-code-header-icon__svg--light',
      ]),
      renderIcon(icon.dark, apiBase, [
        'pf-code-header-icon__svg',
        'pf-code-header-icon__svg--dark',
      ]),
    ]);

    return [lightIcon, darkIcon].filter((node): node is HastElement =>
      Boolean(node),
    );
  }

  const node = await renderIcon(icon.name, apiBase, [
    'pf-code-header-icon__svg',
  ]);

  return node ? [node] : [];
}

async function renderIcon(
  name: string,
  apiBase: string,
  className: string[],
): Promise<HastElement | undefined> {
  const { prefix, icon } = parseIconName(name);
  const collection = await loadIconCollection(prefix, icon, apiBase);
  const iconData = collection ? getIconData(collection, icon) : undefined;

  if (!iconData) {
    return undefined;
  }

  const renderedIcon = iconToSVG(iconData, { height: '1em', width: '1em' });
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg"',
    ...Object.entries(renderedIcon.attributes).map(
      ([name, value]) => ` ${name}="${escapeAttribute(value)}"`,
    ),
    '>',
    renderedIcon.body,
    '</svg>',
  ].join('');

  return {
    children: [],
    properties: {
      alt: '',
      ariaHidden: 'true',
      className,
      decoding: 'async',
      src: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    },
    tagName: 'img',
    type: 'element',
  };
}

export function getExpressiveCodeHeaderIconNames(): string[] {
  return [
    ...new Set(
      fileTreeComponentIconNames.flatMap((icon) => getFileIconNames(icon)),
    ),
  ];
}

function escapeAttribute(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function getCodeBlockTitle(props: unknown): string | undefined {
  if (!props || typeof props !== 'object' || !('title' in props)) {
    return undefined;
  }

  const title = (props as { title?: unknown }).title;

  return typeof title === 'string' ? title : undefined;
}

function getCodeBlockLanguageLabel(
  language: string | undefined,
): string | undefined {
  const normalizedLanguage = language?.trim();

  return normalizedLanguage || undefined;
}
