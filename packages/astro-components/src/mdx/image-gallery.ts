import { rehype } from 'rehype';

type Root = ReturnType<ReturnType<typeof rehype>['parse']>;
type HastNode = Root | Root['children'][number];
type ElementNode = Extract<HastNode, { type: 'element' }>;

/** Extract image HTML while preserving Astro's rendered image attributes. */
export function extractImages(html: string | undefined): string[] | undefined {
  const processor = rehype().data('settings', { fragment: true });
  const images = getSlotImages(processor.parse(html ?? ''));

  return images?.map((image) => processor.stringify({
    type: 'root',
    children: [image],
  }));
}

function getSlotImages(root: Root): ElementNode[] | undefined {
  const content = root.children.filter((child) => !isWhitespaceText(child));

  if (content.length === 1 && isParagraphElement(content[0])) {
    return getOnlyImageChildren(content[0]);
  }

  if (content.length > 0 && content.every(isImageElement)) {
    return content;
  }

  return undefined;
}

function isParagraphElement(node: HastNode): node is ElementNode {
  return node.type === 'element' && node.tagName === 'p' && Array.isArray(node.children);
}

function isImageElement(node: HastNode): node is ElementNode {
  return node.type === 'element' && node.tagName === 'img';
}

function isWhitespaceText(node: HastNode): boolean {
  return node.type === 'text' && typeof node.value === 'string' && node.value.trim() === '';
}

function getOnlyImageChildren(paragraph: ElementNode): ElementNode[] | undefined {
  const content = paragraph.children.filter((child) => !isWhitespaceText(child));

  if (content.length === 0 || !content.every(isImageElement)) {
    return undefined;
  }

  return content;
}
