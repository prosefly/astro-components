type PageInitializer = () => void;

declare global {
  interface Window {
    __proseflyClientInitializers?: Set<string>;
  }
}

export function registerPageInitializer(
  key: string,
  initializer: PageInitializer,
  onRegister?: () => void,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const initializers = (window.__proseflyClientInitializers ??= new Set());

  if (initializers.has(key)) {
    return;
  }

  initializers.add(key);
  onRegister?.();
  document.addEventListener('astro:page-load', initializer);
  initializer();
}
