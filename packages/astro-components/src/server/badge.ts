import { rehype } from 'rehype';

/** Unwrap the single paragraph MDX adds around a multiline badge label. */
export function normalizeBadgeContent(html: string | undefined): string {
  const content = html?.trim() ?? '';
  const processor = rehype().data('settings', { fragment: true });
  const root = processor.parse(content);
  const children = root.children.filter(
    (child) => child.type !== 'text' || child.value.trim() !== '',
  );
  const paragraph = children[0];

  if (
    children.length !== 1 ||
    paragraph.type !== 'element' ||
    paragraph.tagName !== 'p'
  ) {
    return content;
  }

  return processor.stringify({ type: 'root', children: paragraph.children }).trim();
}
