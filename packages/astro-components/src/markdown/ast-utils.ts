export interface MarkdownNode {
  type: string;
  children?: MarkdownNode[];
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MarkdownRoot extends MarkdownNode {
  children: MarkdownNode[];
}

export interface MdxImportSpecifier {
  imported: string;
  local: string;
}

export type MarkdownVisitor = (
  node: MarkdownNode,
  parent?: MarkdownNode,
  index?: number,
  ancestors?: MarkdownNode[],
) => void;

export function visitMarkdownTree(
  root: MarkdownNode,
  visitor: MarkdownVisitor,
): void {
  visitMarkdownNode(root, visitor);
}

function visitMarkdownNode(
  node: MarkdownNode,
  visitor: MarkdownVisitor,
  parent?: MarkdownNode,
  index?: number,
  ancestors: MarkdownNode[] = [],
): void {
  visitor(node, parent, index, ancestors);

  node.children?.forEach((child, childIndex) => {
    visitMarkdownNode(child, visitor, node, childIndex, [...ancestors, node]);
  });
}

export function isMdxComponentNode(node: MarkdownNode): boolean {
  return node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement';
}

export function createMdxImport(
  specifiers: readonly MdxImportSpecifier[],
): MarkdownNode {
  const imports = specifiers
    .map(({ imported, local }) =>
      imported === local ? imported : `${imported} as ${local}`,
    )
    .join(', ');

  return {
    type: 'mdxjsEsm',
    value: `import { ${imports} } from '@prosefly/astro-components';`,
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        body: [
          {
            type: 'ImportDeclaration',
            specifiers: specifiers.map(({ imported, local }) => ({
              type: 'ImportSpecifier',
              imported: { type: 'Identifier', name: imported },
              local: { type: 'Identifier', name: local },
            })),
            source: {
              type: 'Literal',
              value: '@prosefly/astro-components',
              raw: "'@prosefly/astro-components'",
            },
          },
        ],
      },
    },
  };
}

export function hasMdxImport(root: MarkdownRoot, localName: string): boolean {
  return root.children.some(
    (node) =>
      node.type === 'mdxjsEsm' &&
      typeof node.value === 'string' &&
      node.value.includes(localName),
  );
}
