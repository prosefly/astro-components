type ActivateOptions = {
  focus?: boolean;
  persist?: boolean;
};

interface Selection {
  source: TabsElement;
  syncKey: string;
  label: string;
}

function getStoredLabel(syncKey: string | null): string | undefined {
  if (!syncKey) return undefined;
  try {
    return localStorage.getItem(`pf-tabs:${syncKey}`) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeLabel(syncKey: string | null, label: string | null): void {
  if (!syncKey || !label) return;
  try {
    localStorage.setItem(`pf-tabs:${syncKey}`, label);
  } catch {
    // Ignore storage failures in restricted browsing contexts.
  }
}

function setCopyState(button: HTMLButtonElement, copied: boolean): void {
  const copyIcon = button.querySelector('[data-pf-tabs-copy-icon="copy"]');
  const checkIcon = button.querySelector('[data-pf-tabs-copy-icon="check"]');
  copyIcon?.toggleAttribute('hidden', copied);
  checkIcon?.toggleAttribute('hidden', !copied);
  button.setAttribute('aria-label', copied ? 'Copied' : 'Copy code');
  button.setAttribute('title', copied ? 'Copied' : 'Copy code');
}

export class TabsElement extends HTMLElement {
  private events?: AbortController;
  private copyTimers = new Map<HTMLButtonElement, number>();

  /** Nested groups own their controls, panels, icons, and code blocks. */
  private owned<T extends Element = HTMLElement>(selector: string): T[] {
    return [...this.querySelectorAll<T>(selector)].filter(
      (element) => element.closest('pf-tabs') === this,
    );
  }

  private activate(trigger: HTMLElement, options: ActivateOptions = {}): void {
    const panelId = trigger.getAttribute('data-tab-panel');
    const label = trigger.getAttribute('data-tab-label');
    const syncKey = this.getAttribute('data-sync-key');

    for (const button of this.owned('[data-pf-tabs-trigger]')) {
      const isActive = button === trigger;
      button.setAttribute('aria-selected', String(isActive));
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    }
    for (const panel of this.owned('.pf-tabs__panel')) {
      panel.toggleAttribute('hidden', panel.id !== panelId);
    }
    let hasActiveIcon = false;
    for (const icon of this.owned('[data-pf-tabs-icon-for]')) {
      const isActive = icon.getAttribute('data-pf-tabs-icon-for') === panelId;
      icon.toggleAttribute('hidden', !isActive);
      hasActiveIcon ||= isActive;
    }
    this.owned('.pf-tabs__active-icons')[0]?.toggleAttribute('hidden', !hasActiveIcon);
    if (options.focus) trigger.focus();
    if (options.persist === false) return;

    storeLabel(syncKey, label);
    if (syncKey && label) {
      document.dispatchEvent(new CustomEvent<Selection>('pf-tabs:select', {
        detail: { source: this, syncKey, label },
      }));
    }
  }

  connectedCallback(): void {
    if (this.events) return;
    const triggers = this.owned('[data-pf-tabs-trigger]');
    if (triggers.length === 0) return;

    this.events = new AbortController();
    const { signal } = this.events;
    const storedLabel = getStoredLabel(this.getAttribute('data-sync-key'));
    const selected = triggers.find((trigger) =>
      storedLabel !== undefined && trigger.getAttribute('data-tab-label') === storedLabel,
    ) ?? triggers.find((trigger) => trigger.getAttribute('aria-selected') === 'true') ?? triggers[0];
    this.activate(selected, { persist: false });

    for (const trigger of triggers) {
      trigger.addEventListener('click', () => this.activate(trigger), { signal });
      trigger.addEventListener('keydown', (event) => {
        const currentIndex = triggers.indexOf(trigger);
        let nextIndex: number;
        if (event.key === 'ArrowRight') nextIndex = currentIndex + 1;
        else if (event.key === 'ArrowLeft') nextIndex = currentIndex - 1;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = triggers.length - 1;
        else return;
        event.preventDefault();
        this.activate(triggers[(nextIndex + triggers.length) % triggers.length], { focus: true });
      }, { signal });
    }

    document.addEventListener('pf-tabs:select', (event) => {
      if (!(event instanceof CustomEvent)) return;
      const selection = event.detail as Selection;
      if (selection.source === this || selection.syncKey !== this.getAttribute('data-sync-key')) return;
      const matching = triggers.find((trigger) => trigger.getAttribute('data-tab-label') === selection.label);
      if (matching) this.activate(matching, { persist: false });
    }, { signal });

    for (const button of this.owned<HTMLButtonElement>('[data-pf-tabs-copy]')) {
      let request = 0;
      button.addEventListener('click', async () => {
        const panel = this.owned('.pf-tabs__panel').find((panel) => !panel.hidden);
        const code = panel && this.owned('pre code').find((code) => panel.contains(code));
        const text = code?.textContent;
        if (!text) return;
        const currentRequest = ++request;
        try {
          if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is not available.');
          await navigator.clipboard.writeText(text);
          // A clipboard promise can resolve after removal, reconnection, or another click.
          if (signal.aborted || currentRequest !== request) return;
          window.clearTimeout(this.copyTimers.get(button));
          setCopyState(button, true);
          this.copyTimers.set(button, window.setTimeout(() => {
            setCopyState(button, false);
            this.copyTimers.delete(button);
          }, 1600));
        } catch {
          if (signal.aborted || currentRequest !== request) return;
          window.clearTimeout(this.copyTimers.get(button));
          this.copyTimers.delete(button);
          setCopyState(button, false);
        }
      }, { signal });
    }
  }

  disconnectedCallback(): void {
    this.events?.abort();
    this.events = undefined;
    for (const timer of this.copyTimers.values()) window.clearTimeout(timer);
    this.copyTimers.clear();
    for (const button of this.owned<HTMLButtonElement>('[data-pf-tabs-copy]')) {
      setCopyState(button, false);
    }
  }
}

if (!customElements.get('pf-tabs')) {
  customElements.define('pf-tabs', TabsElement);
}
