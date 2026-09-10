import { createHash } from 'node:crypto';
import type { RehypePlugin } from '@astrojs/markdown-remark';
import { renderMermaidSVG } from 'beautiful-mermaid';
import { rehype } from 'rehype';

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  data?: Record<string, unknown>;
  children?: HastNode[];
  position?: {
    start?: {
      line?: number;
    };
  };
}

interface VFileLike {
  path?: string;
}

const FORBIDDEN_TAGS = new Set([
  'embed',
  'foreignObject',
  'iframe',
  'link',
  'object',
  'script',
]);

const MERMAID_THEME = {
  accent: 'var(--pf-accent, #3e7e55)',
  bg: 'var(--pf-background, #ffffff)',
  border: 'var(--pf-border-subtle, #e5e7eb)',
  fg: 'var(--pf-text, #344054)',
  line: 'var(--pf-border-muted, #d0d5dd)',
  muted: 'var(--pf-text-muted, #667085)',
  surface: 'var(--pf-surface, #f4f6f8)',
  transparent: true,
} as const;

/** Render `mermaid` code blocks as static SVG diagrams. */
export const rehypeMermaid: RehypePlugin = function rehypeMermaid() {
  return (tree, file): void => {
    let diagramIndex = 0;

    transformChildren(
      tree as unknown as HastNode,
      file as VFileLike,
      () => diagramIndex++,
    );
  };
};

function transformChildren(
  parent: HastNode,
  file: VFileLike,
  nextIndex: () => number,
): void {
  if (!parent.children) return;

  parent.children = parent.children.map((node) => {
    const code = getMermaidCode(node);
    if (code) {
      return renderDiagram(code, node, file, nextIndex());
    }

    transformChildren(node, file, nextIndex);
    return node;
  });
}

function getMermaidCode(node: HastNode): HastNode | undefined {
  if (node.type !== 'element' || node.tagName !== 'pre') return;

  const code = node.children?.find(
    (child) => child.type === 'element' && child.tagName === 'code',
  );
  if (!code || !hasClass(code, 'language-mermaid')) return;

  return code;
}

function hasClass(node: HastNode, className: string): boolean {
  const value = node.properties?.className;

  if (Array.isArray(value)) return value.includes(className);
  if (typeof value === 'string') return value.split(/\s+/).includes(className);
  return false;
}

function renderDiagram(
  code: HastNode,
  sourceNode: HastNode,
  file: VFileLike,
  index: number,
): HastNode {
  const source = getText(code).trimEnd();
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 8);
  const prefix = `pf-mermaid-${hash}-${index + 1}`;

  try {
    const output = renderMermaidSVG(source, MERMAID_THEME);
    const svg = parseSvg(output);

    sanitizeSvg(svg);
    prefixIds(svg, prefix);
    prepareSvg(svg, getDiagramTitle(code, source), prefix);

    return {
      type: 'element',
      tagName: 'figure',
      properties: {
        className: ['pf-mermaid'],
        style: 'overflow-x:auto',
      },
      children: [svg],
      position: sourceNode.position,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const path = file.path ? ` in ${file.path}` : '';
    const line = sourceNode.position?.start?.line
      ? `:${sourceNode.position.start.line}`
      : '';

    throw new Error(`Failed to render Mermaid diagram${path}${line}: ${message}`, {
      cause: error,
    });
  }
}

function getText(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return node.children?.map(getText).join('') ?? '';
}

function parseSvg(output: string): HastNode {
  const tree = rehype().parse(output) as unknown as HastNode;
  const svg = findElement(tree, 'svg');

  if (!svg) throw new Error('The renderer did not return an SVG element.');
  return svg;
}

function findElement(node: HastNode, tagName: string): HastNode | undefined {
  if (node.type === 'element' && node.tagName === tagName) return node;

  for (const child of node.children ?? []) {
    const match = findElement(child, tagName);
    if (match) return match;
  }

  return undefined;
}

function sanitizeSvg(node: HastNode): void {
  if (node.tagName === 'style') {
    for (const child of node.children ?? []) {
      if (child.type !== 'text' || typeof child.value !== 'string') continue;

      child.value = child.value
        .replace(/^\s*@import\s+url\(.+\);\s*$/gm, '')
        .replace(
          /text\s*\{\s*font-family:[^}]*\}/,
          'text { font-family: var(--pf-font-sans, ui-sans-serif, system-ui, sans-serif); }',
        )
        .replace(
          /\.mono\s*\{\s*font-family:[^}]*\}/,
          '.mono { font-family: var(--pf-font-mono, ui-monospace, monospace); }',
        );
    }
  }

  if (node.properties) {
    for (const [name, value] of Object.entries(node.properties)) {
      if (/^on/i.test(name)) {
        delete node.properties[name];
        continue;
      }

      if (
        typeof value === 'string' &&
        ((['href', 'src', 'xLinkHref'].includes(name) && /^\s*javascript:/i.test(value)) ||
          (name === 'style' && /(?:javascript:|expression\s*\()/i.test(value)))
      ) {
        delete node.properties[name];
      }
    }
  }

  if (!node.children) return;

  node.children = node.children.filter(
    (child) => !child.tagName || !FORBIDDEN_TAGS.has(child.tagName),
  );
  node.children.forEach(sanitizeSvg);
}

function prefixIds(svg: HastNode, prefix: string): void {
  const ids = new Map<string, string>();

  visit(svg, (node) => {
    const id = node.properties?.id;
    if (typeof id === 'string') ids.set(id, `${prefix}-${id}`);
  });

  visit(svg, (node) => {
    if (node.properties) {
      for (const [name, value] of Object.entries(node.properties)) {
        if (typeof value !== 'string') continue;

        if (name === 'id' && ids.has(value)) {
          node.properties[name] = ids.get(value);
          continue;
        }

        node.properties[name] = replaceIdReferences(value, ids);
      }
    }

    if (node.type === 'text' && typeof node.value === 'string') {
      node.value = replaceIdReferences(node.value, ids);
    }
  });
}

function replaceIdReferences(value: string, ids: Map<string, string>): string {
  let result = value.replace(/url\(#([^)]+)\)/g, (match, id: string) =>
    ids.has(id) ? `url(#${ids.get(id)})` : match,
  );

  if (result.startsWith('#') && ids.has(result.slice(1))) {
    result = `#${ids.get(result.slice(1))}`;
  }

  return result;
}

function visit(node: HastNode, visitor: (node: HastNode) => void): void {
  visitor(node);
  node.children?.forEach((child) => visit(child, visitor));
}

function prepareSvg(svg: HastNode, title: string, prefix: string): void {
  const titleId = `${prefix}-title`;
  const existingStyle = typeof svg.properties?.style === 'string'
    ? svg.properties.style
    : '';

  svg.properties = {
    ...svg.properties,
    ariaLabelledBy: titleId,
    focusable: 'false',
    role: 'img',
    style: `${existingStyle};display:block;max-width:100%;height:auto;margin-inline:auto`,
  };
  svg.children = [
    {
      type: 'element',
      tagName: 'title',
      properties: { id: titleId },
      children: [{ type: 'text', value: title }],
    },
    ...(svg.children ?? []),
  ];
}

function getDiagramTitle(code: HastNode, source: string): string {
  const meta = code.data?.meta ?? code.properties?.metastring;
  if (typeof meta === 'string') {
    const match = meta.match(/(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|(\S+))/);
    const title = match?.[1] ?? match?.[2] ?? match?.[3];
    if (title) return title;
  }

  const firstLine = source
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('%%'))
    ?.toLowerCase() ?? '';

  if (firstLine.startsWith('sequencediagram')) return 'Mermaid sequence diagram';
  if (firstLine.startsWith('statediagram')) return 'Mermaid state diagram';
  if (firstLine.startsWith('classdiagram')) return 'Mermaid class diagram';
  if (firstLine.startsWith('erdiagram')) return 'Mermaid entity relationship diagram';
  if (firstLine.startsWith('xychart')) return 'Mermaid XY chart';
  return 'Mermaid flowchart';
}
