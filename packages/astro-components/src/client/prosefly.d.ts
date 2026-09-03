interface ProseflyNamespace {
  initAccordions?: () => void;
  initTabs?: () => void;
  initImageGalleries?: () => void;
}

interface Window {
  __prosefly?: ProseflyNamespace;
}
