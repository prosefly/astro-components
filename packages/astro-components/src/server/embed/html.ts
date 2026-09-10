import { rehype } from 'rehype';

export interface HtmlNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HtmlNode[];
}

export function parseHtml(value: string): HtmlNode {
  return rehype().parse(value) as HtmlNode;
}

export function elements(root: HtmlNode, tagName?: string): HtmlNode[] {
  const found: HtmlNode[] = [];

  visit(root, (node) => {
    if (node.type === 'element' && (!tagName || node.tagName === tagName)) {
      found.push(node);
    }
  });

  return found;
}

export function attribute(node: HtmlNode, name: string): string | undefined {
  const value = node.properties?.[name];

  if (Array.isArray(value)) {
    return value.map(String).join(' ');
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  return undefined;
}

export function text(node: HtmlNode): string {
  if (node.type === 'text' || node.type === 'raw') {
    return node.value ?? '';
  }

  return node.children?.map(text).join('') ?? '';
}

function visit(node: HtmlNode, callback: (node: HtmlNode) => void): void {
  callback(node);
  node.children?.forEach((child) => visit(child, callback));
}
