import type { RemarkPlugin } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';

const importStatement =
  "import { Callout as ProseflyDirectiveCallout } from '@prosefly/astro-components';";

const calloutTypes = new Map([
  ['caution', 'warning'],
  ['danger', 'danger'],
  ['note', 'note'],
  ['tip', 'tip'],
  ['warning', 'warning'],
]);

interface MarkdownNode {
  type: string;
  children?: MarkdownNode[];
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

interface DirectiveNode extends MarkdownNode {
  attributes?: Record<string, string | null | undefined> | null;
  children: MarkdownNode[];
  name: string;
  type: 'containerDirective' | 'leafDirective';
}

interface RootNode extends MarkdownNode {
  children: MarkdownNode[];
}

interface ProcessorWithUse {
  use(plugin: unknown, options?: unknown): void;
}

export const remarkCalloutDirectives: RemarkPlugin = function (
  this: ProcessorWithUse,
) {
  this.use(remarkDirective);

  return (tree) => {
    const root = tree as RootNode;
    let transformed = false;

    visitChildren(root, (node, parent, index) => {
      if (
        !parent?.children ||
        index === undefined ||
        !isCalloutDirective(node)
      ) {
        return;
      }

      parent.children[index] = createCalloutNode(node);
      transformed = true;
    });

    if (transformed && !hasCalloutDirectiveImport(root)) {
      root.children.unshift(createImportNode());
    }
  };
};

function visitChildren(
  node: MarkdownNode,
  visitor: (node: MarkdownNode, parent?: MarkdownNode, index?: number) => void,
  parent?: MarkdownNode,
  index?: number,
): void {
  visitor(node, parent, index);

  if (!node.children) {
    return;
  }

  node.children.forEach((child, childIndex) => {
    visitChildren(child, visitor, node, childIndex);
  });
}

function isCalloutDirective(node: MarkdownNode): node is DirectiveNode {
  return (
    (node.type === 'containerDirective' || node.type === 'leafDirective') &&
    typeof node.name === 'string' &&
    calloutTypes.has(node.name) &&
    Array.isArray(node.children)
  );
}

function createCalloutNode(node: DirectiveNode): MarkdownNode {
  const { title, children } = getCalloutContent(node);
  const type = calloutTypes.get(node.name) ?? 'note';
  const attributes = [
    {
      type: 'mdxJsxAttribute',
      name: 'type',
      value: type,
    },
  ];

  if (title) {
    attributes.push({
      type: 'mdxJsxAttribute',
      name: 'title',
      value: title,
    });
  }

  return {
    type: 'mdxJsxFlowElement',
    name: 'ProseflyDirectiveCallout',
    attributes,
    children,
  };
}

function getCalloutContent(node: DirectiveNode): {
  children: MarkdownNode[];
  title?: string;
} {
  const title = getAttributeTitle(node) ?? getDirectiveLabel(node);
  const children = title
    ? node.children.filter((child) => !isDirectiveLabel(child))
    : node.children;

  return { children, title };
}

function getAttributeTitle(node: DirectiveNode): string | undefined {
  const title = node.attributes?.title;

  return typeof title === 'string' && title.trim() ? title : undefined;
}

function getDirectiveLabel(node: DirectiveNode): string | undefined {
  const label = node.children.find(isDirectiveLabel);

  if (!label?.children) {
    return undefined;
  }

  const text = label.children.map(getPlainText).join('').trim();

  return text || undefined;
}

function isDirectiveLabel(node: MarkdownNode): boolean {
  return node.type === 'paragraph' && node.data?.directiveLabel === true;
}

function getPlainText(node: MarkdownNode): string {
  if (typeof node.value === 'string') {
    return node.value;
  }

  return node.children?.map(getPlainText).join('') ?? '';
}

function createImportNode(): MarkdownNode {
  return {
    type: 'mdxjsEsm',
    value: importStatement,
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        body: [
          {
            type: 'ImportDeclaration',
            specifiers: [
              {
                type: 'ImportSpecifier',
                imported: { type: 'Identifier', name: 'Callout' },
                local: { type: 'Identifier', name: 'ProseflyDirectiveCallout' },
              },
            ],
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

function hasCalloutDirectiveImport(tree: RootNode): boolean {
  return tree.children.some(
    (node) =>
      node.type === 'mdxjsEsm' &&
      typeof node.value === 'string' &&
      node.value.includes('ProseflyDirectiveCallout'),
  );
}
