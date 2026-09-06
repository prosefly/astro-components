interface ProseflyNamespace {
  initAccordions?: () => void;
  initTabs?: () => void;
  initImageGalleries?: () => void;
  initMediaPlayers?: () => void;
}

interface Window {
  __prosefly?: ProseflyNamespace;
}
