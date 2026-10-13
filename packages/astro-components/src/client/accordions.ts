export class AccordionsElement extends HTMLElement {
  private events?: AbortController;
  private initialized = false;

  private items(): HTMLDetailsElement[] {
    return [...this.querySelectorAll(':scope > [data-pf-accordion]')].filter(
      (item): item is HTMLDetailsElement => item instanceof HTMLDetailsElement,
    );
  }

  private closeSiblings(activeItem: HTMLDetailsElement): void {
    if (this.hasAttribute('data-multiple')) return;
    for (const item of this.items()) {
      if (item !== activeItem) item.open = false;
    }
  }

  private openHashTarget(): void {
    if (!location.hash) return;
    let id: string;
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      return;
    }
    const item = this.items().find((item) => item.id === id);
    if (item) {
      item.open = true;
      this.closeSiblings(item);
    }
  }

  connectedCallback(): void {
    if (this.events) return;
    const items = this.items();
    if (items.length === 0) return;
    this.events = new AbortController();
    const { signal } = this.events;

    // Apply defaults once, preserving the reader's open state after reconnection.
    if (!this.initialized) {
      let defaults: unknown;
      try {
        defaults = JSON.parse(this.getAttribute('data-default-values') ?? '[]');
      } catch {
        defaults = [];
      }
      for (const item of items) {
        if (Array.isArray(defaults) && defaults.includes(item.getAttribute('data-value'))) {
          item.open = true;
        }
        if (item.open) this.closeSiblings(item);
      }
      this.initialized = true;
    }

    for (const item of items) {
      item.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const trigger = event.target.closest('[data-pf-accordion-trigger]');
        // Clicks in nested accordions must not toggle or disable the outer item.
        if (trigger?.closest('[data-pf-accordion]') !== item) return;
        if (item.getAttribute('data-disabled') === 'true') {
          event.preventDefault();
          return;
        }
        if (!item.open) this.closeSiblings(item);
      }, { signal });
      item.addEventListener('toggle', () => {
        if (item.open) this.closeSiblings(item);
      }, { signal });
    }
    window.addEventListener('hashchange', () => this.openHashTarget(), { signal });
    this.openHashTarget();
  }

  disconnectedCallback(): void {
    this.events?.abort();
    this.events = undefined;
  }
}

if (!customElements.get('pf-accordions')) {
  customElements.define('pf-accordions', AccordionsElement);
}
