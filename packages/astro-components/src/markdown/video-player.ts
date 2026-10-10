import type { RehypePlugin } from '@astrojs/markdown-remark';
import {
  resolveVideoPlayerOptions,
  type VideoPlayerOptions,
} from '../server/video-player.js';
import {
  createMdxImport,
  isMdxComponentNode,
  visitMarkdownTree,
  type MarkdownNode,
  type MarkdownRoot,
} from './ast-utils.js';

interface Expression {
  type: string;
  properties?: unknown[];
  [key: string]: unknown;
}

interface ExpressionProgram {
  type: string;
  sourceType: string;
  body: { type: string; expression: Expression }[];
}

interface MdxAttribute {
  type: string;
  name?: string;
  value?: string | null | {
    type: string;
    value: string;
    data?: { estree?: ExpressionProgram };
  };
  data?: { estree?: ExpressionProgram };
}

interface MdxNode extends MarkdownNode {
  name?: string;
  attributes?: MdxAttribute[];
}

function attribute(node: MdxNode, name: string) {
  return node.attributes?.find((entry) =>
    entry.type === 'mdxJsxAttribute' && entry.name?.toLowerCase() === name,
  );
}

function hasSource(node: MdxNode): boolean {
  const src = attribute(node, 'src');
  if (typeof src?.value === 'string') return src.value.trim().length > 0;
  if (!src?.value || typeof src.value !== 'object') return false;
  const expression = src.value.data?.estree?.body[0]?.expression;
  // Dynamic sources stay dynamic, but literal empty/null/false sources don't qualify.
  return expression?.type !== 'Literal' || (
    typeof expression.value === 'string' && expression.value.trim().length > 0
  );
}

function defaultAttribute(node: MdxNode, name: string, value: string | null = null) {
  node.attributes ??= [];
  if (!attribute(node, name)) node.attributes.push({ type: 'mdxJsxAttribute', name, value });
}

function plainText(node: MarkdownNode): string {
  if (node.type === 'text' && typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(plainText).join('');
}

function property(name: string, value: Expression) {
  return {
    type: 'Property',
    key: { type: 'Literal', value: name },
    value,
    kind: 'init',
    method: false,
    shorthand: false,
    computed: false,
  };
}

function expressionAttribute(name: string, value: string, expression: Expression): MdxAttribute {
  return {
    type: 'mdxJsxAttribute',
    name,
    value: {
      type: 'mdxJsxAttributeValueExpression',
      value,
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          body: [{ type: 'ExpressionStatement', expression }],
        },
      },
    },
  };
}

/** Pack original figure attributes separately so none collide with player props. */
function figureAttributes(attributes: MdxAttribute[]): MdxAttribute {
  const properties: unknown[] = [];
  const source: string[] = [];
  for (const entry of attributes) {
    if (entry.type === 'mdxJsxExpressionAttribute') {
      const expression = entry.data?.estree?.body[0]?.expression;
      if (expression?.type !== 'ObjectExpression' || !expression.properties) {
        throw new Error('VideoPlayer requires parsed MDX spread attributes.');
      }
      properties.push(...expression.properties);
      source.push(String(entry.value));
    } else if (entry.name) {
      const value = entry.value;
      if (value && typeof value === 'object') {
        const expression = value.data?.estree?.body[0]?.expression;
        if (!expression) throw new Error('VideoPlayer requires parsed MDX attribute expressions.');
        properties.push(property(entry.name, expression));
        source.push(`${JSON.stringify(entry.name)}: (${value.value})`);
      } else {
        const literal = value ?? true;
        properties.push(property(entry.name, { type: 'Literal', value: literal }));
        source.push(`${JSON.stringify(entry.name)}: ${JSON.stringify(literal)}`);
      }
    }
  }
  return expressionAttribute('figureAttributes', `({${source.join(',')}})`, { type: 'ObjectExpression', properties });
}

/** Opt-in, MDX-only conversion of video-only HTML figures. Never fetches media. */
export const rehypeVideoPlayer: RehypePlugin = (options: VideoPlayerOptions = {}) => {
  const resolved = resolveVideoPlayerOptions(options);
  return (tree, file) => {
    if (!String(file.path ?? '').toLowerCase().endsWith('.mdx')) return;
    const root = tree as unknown as MarkdownRoot;
    const usedNames = new Set<string>();
    visitMarkdownTree(root, (node) => {
      if (typeof node.name === 'string') usedNames.add(node.name);
    });
    let local = 'ProseflyVideoPlayer';
    let suffix = 0;
    while (usedNames.has(local) || root.children.some((node) =>
      node.type === 'mdxjsEsm' &&
      typeof node.value === 'string' &&
      new RegExp(`\\b${local}\\b`).test(node.value),
    )) {
      local = `ProseflyVideoPlayer${++suffix}`;
    }
    let transformed = false;
    visitMarkdownTree(root, (node) => {
      if (!isMdxComponentNode(node) || node.name !== 'figure') return;
      const figure = node as MdxNode;
      const children = (figure.children ?? []).filter((child) =>
        child.type !== 'text' || (typeof child.value === 'string' && child.value.trim()),
      );
      const videos = children.filter((child) =>
        isMdxComponentNode(child) && child.name === 'video',
      ) as MdxNode[];
      const captions = children.filter((child) =>
        isMdxComponentNode(child) && child.name === 'figcaption',
      ) as MdxNode[];
      if (videos.length !== 1 || captions.length > 1 || children.length !== videos.length + captions.length) return;
      const video = videos[0];
      if (!hasSource(video) && !video.children?.some((child) =>
        child.name === 'source' && hasSource(child as MdxNode),
      )) return;
      figure.name = local;
      figure.attributes = [
        figureAttributes(figure.attributes ?? []),
        expressionAttribute('shortVideoSeconds', String(resolved.shortVideoSeconds), {
          type: 'Literal', value: resolved.shortVideoSeconds,
        }),
        expressionAttribute('labels', JSON.stringify(resolved.labels), {
          type: 'ObjectExpression',
          properties: Object.entries(resolved.labels).map(([name, value]) =>
            property(name, { type: 'Literal', value }),
          ),
        }),
      ];
      defaultAttribute(video, 'controls');
      defaultAttribute(video, 'playsinline');
      defaultAttribute(video, 'preload', 'metadata');
      video.attributes = (video.attributes ?? []).filter((entry) => entry.name !== 'slot');
      defaultAttribute(video, 'slot', 'media');
      const caption = captions[0];
      if (caption) {
        // Keep the figcaption itself and its attributes; don't nest it in another caption.
        caption.attributes = (caption.attributes ?? []).filter((entry) => entry.name !== 'slot');
        defaultAttribute(caption, 'slot', 'caption');
        const label = plainText(caption).trim();
        if (label && !video.attributes?.some((entry) => entry.type === 'mdxJsxExpressionAttribute')) {
          defaultAttribute(video, 'aria-label', label);
        }
      }
      transformed = true;
    });
    if (transformed) root.children.unshift(createMdxImport([{ imported: 'VideoPlayer', local }]));
  };
};

export type { VideoPlayerOptions } from '../server/video-player.js';
