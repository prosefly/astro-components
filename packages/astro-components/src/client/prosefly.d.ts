interface ProseflyNamespace {
  initAccordions?: () => void;
  initTabs?: () => void;
}

interface Window {
  __prosefly?: ProseflyNamespace;
}
