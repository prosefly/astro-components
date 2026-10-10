type GalleryDirection = 'previous' | 'next';

function imageReady(image: HTMLImageElement, signal: AbortSignal): Promise<void> {
  if (image.complete || signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = () => {
      image.removeEventListener('load', finish);
      image.removeEventListener('error', finish);
      signal.removeEventListener('abort', finish);
      resolve();
    };

    image.addEventListener('load', finish, { once: true });
    image.addEventListener('error', finish, { once: true });
    signal.addEventListener('abort', finish, { once: true });
  });
}

function resolveCssLength(value: string, context: Element): number {
  const trimmed = value.trim();

  if (!trimmed) {
    return 0;
  }

  const probe = document.createElement('div');
  probe.style.contain = 'strict';
  probe.style.height = '0';
  probe.style.overflow = 'hidden';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.width = trimmed;
  context.append(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

function getItemLeft(track: HTMLElement, item: HTMLElement): number {
  return (
    item.getBoundingClientRect().left -
    track.getBoundingClientRect().left +
    track.scrollLeft
  );
}

function getGalleryItems(track: HTMLElement): HTMLElement[] {
  return [...track.querySelectorAll('.pf-image-gallery__item')].filter(
    (item): item is HTMLElement => item instanceof HTMLElement,
  );
}

function updateIndicators(gallery: HTMLElement, track: HTMLElement): void {
  const items = getGalleryItems(track);
  const indicatorGroup = gallery.querySelector<HTMLElement>(
    '[data-pf-image-gallery-indicators]',
  );

  if (!(indicatorGroup instanceof HTMLElement) || track.clientWidth <= 0) {
    return;
  }

  const indicators = [
    ...indicatorGroup.querySelectorAll('[data-pf-image-gallery-indicator]'),
  ].filter((indicator): indicator is HTMLElement =>
    indicator instanceof HTMLElement,
  );

  if (items.length === 0 || indicators.length !== items.length) {
    return;
  }

  const maximumScrollLeft = Math.max(track.scrollWidth - track.clientWidth, 0);
  let currentIndex = 0;
  let currentDistance = Number.POSITIVE_INFINITY;

  if (maximumScrollLeft > 0) {
    items.forEach((item, index) => {
      const itemLeft = Math.min(getItemLeft(track, item), maximumScrollLeft);
      const distance = Math.abs(itemLeft - track.scrollLeft);

      if (distance <= currentDistance) {
        currentIndex = index;
        currentDistance = distance;
      }
    });
  }

  indicators.forEach((indicator, index) => {
    if (index === currentIndex) {
      indicator.dataset.current = 'true';
    } else {
      delete indicator.dataset.current;
    }
  });
}

function scrollToAdjacentItem(
  track: HTMLElement,
  direction: GalleryDirection,
): void {
  const items = [...track.querySelectorAll('.pf-image-gallery__item')].filter(
    (item): item is HTMLElement => item instanceof HTMLElement,
  );
  const currentLeft = track.scrollLeft;
  const positions = items.map((item) => getItemLeft(track, item));
  const target =
    direction === 'previous'
      ? positions.findLast((left) => left < currentLeft - 2)
      : positions.find((left) => left > currentLeft + 2);

  track.scrollTo({
    behavior: 'smooth',
    left:
      target ??
      (direction === 'previous' ? 0 : track.scrollWidth - track.clientWidth),
  });
}

function measureGallery(gallery: HTMLElement, track: HTMLElement): void {
  const items = getGalleryItems(track);
  const images = items
    .map((item) => item.querySelector('img'))
    .filter(
      (image): image is HTMLImageElement => image instanceof HTMLImageElement,
    );

  if (
    items.length === 0 ||
    items.length !== images.length ||
    track.clientWidth <= 0
  ) {
    return;
  }

  const ratios = images.map((image) =>
    image.naturalWidth > 0 && image.naturalHeight > 0
      ? image.naturalWidth / image.naturalHeight
      : undefined,
  );

  if (ratios.some((ratio) => !ratio)) {
    return;
  }

  const resolvedRatios = ratios as number[];
  const styles = getComputedStyle(track);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
  const previewWidth = resolveCssLength(
    getComputedStyle(gallery).getPropertyValue(
      '--pf-image-gallery-preview-width',
    ),
    gallery,
  );
  const firstRatio = resolvedRatios[0];
  const targetHeight = Math.max(
    (track.clientWidth - previewWidth - gap) / firstRatio,
    1,
  );

  gallery.style.setProperty(
    '--pf-image-gallery-height',
    `${targetHeight.toFixed(2)}px`,
  );
  gallery.dataset.pfImageGalleryMeasured = 'true';

  items.forEach((item, index) => {
    const ratio = resolvedRatios[index];

    item.style.setProperty('--pf-image-gallery-ratio', ratio.toFixed(5));
    item.style.height = `${targetHeight.toFixed(2)}px`;
    item.style.width = `${Math.max(targetHeight * ratio, 1).toFixed(2)}px`;
  });
}

export class ImageGalleryElement extends HTMLElement {
  private events?: AbortController;
  private observer?: ResizeObserver;

  connectedCallback(): void {
    if (this.events) {
      return;
    }

    const track = this.querySelector<HTMLElement>(
      '[data-pf-image-gallery-track]',
    );

    if (!(track instanceof HTMLElement)) {
      return;
    }

    this.events = new AbortController();
    const { signal } = this.events;
    this.dataset.pfImageGalleryReady = 'true';
    const update = () => updateIndicators(this, track);
    const measure = () => {
      // Image promises from an earlier connection can settle after removal.
      if (signal.aborted) {
        return;
      }

      measureGallery(this, track);
      update();
    };
    const images = [...track.querySelectorAll('img')].filter(
      (image): image is HTMLImageElement => image instanceof HTMLImageElement,
    );

    void Promise.all(images.map((image) => imageReady(image, signal))).then(measure);
    this.observer = new ResizeObserver(measure);
    this.observer.observe(track);
    track.addEventListener('scroll', update, { passive: true, signal });
    update();

    this
      .querySelectorAll('[data-pf-image-gallery-button]')
      .forEach((button) => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }

        button.addEventListener('click', () => {
          const direction = button.getAttribute('data-pf-image-gallery-button');

          scrollToAdjacentItem(
            track,
            direction === 'previous' ? 'previous' : 'next',
          );
        }, { signal });
      });
  }

  disconnectedCallback(): void {
    this.events?.abort();
    this.observer?.disconnect();
    this.events = undefined;
    this.observer = undefined;
    delete this.dataset.pfImageGalleryReady;
  }
}

if (!customElements.get('pf-image-gallery')) {
  customElements.define('pf-image-gallery', ImageGalleryElement);
}
