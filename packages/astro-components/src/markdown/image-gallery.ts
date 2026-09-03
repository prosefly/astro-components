import type { RemarkPlugin } from '@astrojs/markdown-remark';
import {
  createMdxImport,
  hasMdxImport,
  isMdxComponentNode,
  type MarkdownNode,
  type MarkdownRoot,
  visitMarkdownTree,
} from './ast-utils.js';

interface ParagraphNode extends MarkdownNode {
  children: MarkdownNode[];
}

const IMAGE_NODE_TYPES = new Set(['image', 'imageReference']);

/** Convert image-only paragraphs to ImageGallery components in MDX files only. */
export const remarkImageGallery: RemarkPlugin = () => {
  return (tree) => {
    const root = tree as MarkdownRoot;
    let transformed = false;

    visitMarkdownTree(root, (node, parent, index, ancestors) => {
      if (
        !parent ||
        index === undefined ||
        node.type !== 'paragraph' ||
        !isParagraphNode(node) ||
        (ancestors ?? []).some(isMdxComponentNode)
      ) {
        return;
      }

      const images = node.children.filter((child) => !isWhitespaceText(child));

      if (images.length === 0 || !images.every(isImageNode) || !parent.children) {
        return;
      }

      parent.children[index] = {
        type: 'mdxJsxFlowElement',
        name: 'ProseflyImageGallery',
        attributes: [],
        children: node.children,
      };
      transformed = true;
    });

    if (transformed && !hasMdxImport(root, 'ProseflyImageGallery')) {
      root.children.unshift(
        createMdxImport([
          { imported: 'ImageGallery', local: 'ProseflyImageGallery' },
        ]),
      );
    }
  };
};

function isParagraphNode(node: MarkdownNode): node is ParagraphNode {
  return node.type === 'paragraph' && Array.isArray(node.children);
}

function isImageNode(node: MarkdownNode): boolean {
  return IMAGE_NODE_TYPES.has(node.type);
}

function isWhitespaceText(node: MarkdownNode): boolean {
  return node.type === 'text' && typeof node.value === 'string' && node.value.trim() === '';
}
