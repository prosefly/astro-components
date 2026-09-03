type PageInitializer = () => void;

interface PageInitializers {
  initAccordions?: PageInitializer;
  initTabs?: PageInitializer;
  initImageGalleries?: PageInitializer;
}

declare global {
  interface ProseflyClient extends PageInitializers {}

  interface Window {
    __prosefly?: ProseflyClient;
  }
}

export function registerPageInitializer(
  key: keyof PageInitializers,
  initializer: PageInitializer,
  onRegister?: () => void,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const client = (window.__prosefly ??= {});

  if (client[key]) {
    return;
  }

  client[key] = initializer;
  onRegister?.();
  document.addEventListener('astro:page-load', initializer);
  initializer();
}
