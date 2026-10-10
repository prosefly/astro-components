import assert from 'node:assert/strict';
import { getEventListeners, setMaxListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { extractImages } from '../dist/server/image-gallery.js';

test('extracts single and multiple images without losing native image attributes', () => {
  const image = '<img src="/first.webp" alt="First" width="800" height="400" loading="lazy">';
  const single = extractImages(`<p>${image}</p>`);
  assert.equal(single.length, 1);
  assert.match(single[0], /loading="lazy"/);
  assert.match(single[0], /width="800"/);
  assert.equal(extractImages(`${image}\n<img src="/second.webp" alt="Second">`).length, 2);
  assert.equal(extractImages('<p><img src="/first.webp">Caption</p>'), undefined);
});

const runtime = await readFile(new URL('../dist/client/image-gallery.js', import.meta.url), 'utf8');

class Element extends EventTarget {
  dataset = {};
  attributes = new Map();
  childrenBySelector = new Map();
  style = {
    properties: new Map(),
    setProperty(name, value) { this.properties.set(name, value); },
  };
  querySelector(selector) { return this.childrenBySelector.get(selector) ?? null; }
  querySelectorAll(selector) { return this.childrenBySelector.get(selector) ?? []; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  getBoundingClientRect() {
    const width = Number.parseFloat(this.style.width ?? '0');
    return { left: this.left?.() ?? 0, width: this.style.width?.endsWith('rem') ? width * 16 : width };
  }
  append(element) { element.parent = this; }
  remove() { this.parent = undefined; }
}

class Button extends Element {}
class Image extends Element {
  complete = true;
  naturalWidth = 800;
  naturalHeight = 400;
}

class Track extends Element {
  clientWidth = 500;
  scrollLeft = 0;
  scrollCalls = [];
  items = [];
  itemWidth(item) { return Number.parseFloat(item.style.width ?? '424'); }
  get scrollWidth() {
    return this.items.reduce((width, item) => width + this.itemWidth(item), 0) + Math.max(this.items.length - 1, 0) * 12;
  }
  scrollTo(options) {
    this.scrollCalls.push(options);
    this.scrollLeft = Math.max(0, Math.min(options.left, this.scrollWidth - this.clientWidth));
    this.dispatchEvent(new Event('scroll'));
  }
}

function environment() {
  const observers = [];
  const registry = new Map();
  const context = {
    HTMLElement: Element,
    HTMLButtonElement: Button,
    HTMLImageElement: Image,
    AbortController: class extends AbortController {
      constructor() { super(); setMaxListeners(0, this.signal); }
    },
    document: { createElement() { return new Element(); } },
    getComputedStyle() {
      return { columnGap: '12px', getPropertyValue() { return '4rem'; } };
    },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(track) { this.track = track; }
      disconnect() { this.disconnected = true; }
    },
    customElements: {
      get(name) { return registry.get(name); },
      define(name, constructor) { registry.set(name, constructor); },
    },
  };
  vm.runInNewContext(runtime.replace(/^export /gm, '') + '\nglobalThis.Gallery = ImageGalleryElement;', context);

  function createGallery({ loaded = true, ratios = [2, 2, 2], connect = true } = {}) {
    const gallery = new context.Gallery();
    const track = new Track();
    const images = ratios.map((ratio) => {
      const image = new Image();
      image.complete = loaded;
      image.naturalWidth = loaded ? ratio * 400 : 0;
      image.naturalHeight = loaded ? 400 : 0;
      return image;
    });
    track.items = images.map((image, index) => {
      const item = new Element();
      item.childrenBySelector.set('img', image);
      item.left = () => track.items.slice(0, index).reduce((left, previous) => left + track.itemWidth(previous) + 12, 0) - track.scrollLeft;
      return item;
    });
    track.childrenBySelector.set('.pf-image-gallery__item', track.items);
    track.childrenBySelector.set('img', images);
    const indicators = images.map(() => new Element());
    const indicatorGroup = new Element();
    indicatorGroup.childrenBySelector.set('[data-pf-image-gallery-indicator]', indicators);
    const previous = new Button();
    previous.attributes.set('data-pf-image-gallery-button', 'previous');
    const next = new Button();
    next.attributes.set('data-pf-image-gallery-button', 'next');
    gallery.childrenBySelector.set('[data-pf-image-gallery-track]', track);
    gallery.childrenBySelector.set('[data-pf-image-gallery-indicators]', indicatorGroup);
    gallery.childrenBySelector.set('[data-pf-image-gallery-button]', [previous, next]);
    if (connect) gallery.connectedCallback();
    return { gallery, track, images, indicators, previous, next };
  }

  return { createGallery, observers, registry };
}

const emit = (element, event) => element.dispatchEvent(new Event(event));
const click = (element) => emit(element, 'click');
const flush = () => new Promise((resolve) => setImmediate(resolve));
const currentIndicator = (indicators) => indicators.findIndex((indicator) => indicator.dataset.current === 'true');

test('registers the element and measures loaded images once per connection', async () => {
  const { createGallery, observers, registry } = environment();
  const { gallery, track, indicators } = createGallery({ ratios: [2, 0.5, 1] });
  await flush();
  assert.ok(gallery instanceof registry.get('pf-image-gallery'));
  assert.equal(gallery.dataset.pfImageGalleryReady, 'true');
  assert.equal(gallery.style.properties.get('--pf-image-gallery-height'), '212.00px');
  assert.deepEqual(track.items.map((item) => item.style.width), ['424.00px', '106.00px', '212.00px']);
  assert.equal(currentIndicator(indicators), 0);
  gallery.connectedCallback();
  assert.equal(observers.length, 1);
});

test('navigation and scrolling select the closest indicator, including the last image', async () => {
  const { createGallery } = environment();
  const { track, indicators, next, previous } = createGallery();
  await flush();
  click(next);
  assert.equal(track.scrollLeft, 436);
  assert.equal(track.scrollCalls[0].behavior, 'smooth');
  assert.equal(currentIndicator(indicators), 1);
  click(next);
  assert.equal(track.scrollLeft, track.scrollWidth - track.clientWidth);
  assert.equal(currentIndicator(indicators), 2);
  click(previous);
  assert.equal(currentIndicator(indicators), 1);
  click(previous);
  click(previous);
  assert.equal(track.scrollLeft, 0);
  track.scrollLeft = 400;
  emit(track, 'scroll');
  assert.equal(currentIndicator(indicators), 1);
});

test('resize measurement preserves aspect ratios and refreshes the current indicator', async () => {
  const { createGallery, observers } = environment();
  const { gallery, track, indicators } = createGallery();
  await flush();
  track.clientWidth = 600;
  observers[0].callback();
  assert.equal(gallery.style.properties.get('--pf-image-gallery-height'), '262.00px');
  assert.equal(track.items[0].style.width, '524.00px');
  track.scrollLeft = 536;
  observers[0].callback();
  assert.equal(currentIndicator(indicators), 1);
});

test('disconnect cleans up navigation, scrolling and observers; reconnect preserves position', async () => {
  const { createGallery, observers } = environment();
  const { gallery, track, indicators, next } = createGallery();
  await flush();
  click(next);
  gallery.disconnectedCallback();
  assert.equal(gallery.dataset.pfImageGalleryReady, undefined);
  assert.equal(observers[0].disconnected, true);
  assert.equal(getEventListeners(track, 'scroll').length, 0);
  assert.equal(getEventListeners(next, 'click').length, 0);
  click(next);
  assert.equal(track.scrollLeft, 436);
  const height = gallery.style.properties.get('--pf-image-gallery-height');
  track.clientWidth = 600;
  observers[0].callback();
  assert.equal(gallery.style.properties.get('--pf-image-gallery-height'), height);
  gallery.disconnectedCallback();
  track.clientWidth = 500;
  gallery.connectedCallback();
  await flush();
  assert.equal(track.scrollLeft, 436);
  assert.equal(currentIndicator(indicators), 1);
  assert.equal(getEventListeners(next, 'click').length, 1);
  click(next);
  assert.equal(currentIndicator(indicators), 2);
  assert.equal(track.scrollCalls.length, 2);
});

test('pending image loads release both listeners on completion or removal', async () => {
  const { createGallery } = environment();
  const { gallery, images } = createGallery({ loaded: false });
  assert.equal(getEventListeners(images[0], 'load').length, 1);
  images[0].naturalWidth = 800;
  images[0].naturalHeight = 400;
  emit(images[0], 'load');
  assert.equal(getEventListeners(images[0], 'load').length, 0);
  assert.equal(getEventListeners(images[0], 'error').length, 0);
  gallery.disconnectedCallback();
  for (const image of images) {
    assert.equal(getEventListeners(image, 'load').length, 0);
    assert.equal(getEventListeners(image, 'error').length, 0);
    image.naturalWidth = 800;
    image.naturalHeight = 400;
    emit(image, 'load');
  }
  await flush();
  assert.equal(gallery.dataset.pfImageGalleryMeasured, undefined);
});

test('old image promises cannot measure a reconnected gallery', async () => {
  const { createGallery } = environment();
  const { gallery, images } = createGallery({ loaded: false });
  gallery.disconnectedCallback();
  gallery.connectedCallback();
  // Dimensions can appear before the new connection receives its load events.
  for (const image of images) {
    image.naturalWidth = 800;
    image.naturalHeight = 400;
  }
  await flush();
  assert.equal(gallery.dataset.pfImageGalleryMeasured, undefined);
  for (const image of images) emit(image, 'load');
  await flush();
  assert.equal(gallery.dataset.pfImageGalleryMeasured, 'true');
});

test('failed images and zero-width tracks retain fallback layout until measurable', async () => {
  const { createGallery, observers } = environment();
  const { gallery, track, images } = createGallery({ ratios: [2, 0, 2] });
  await flush();
  assert.equal(gallery.dataset.pfImageGalleryMeasured, undefined);
  images[1].naturalWidth = 800;
  track.clientWidth = 0;
  observers[0].callback();
  assert.equal(gallery.dataset.pfImageGalleryMeasured, undefined);
  track.clientWidth = 500;
  observers[0].callback();
  assert.equal(gallery.dataset.pfImageGalleryMeasured, 'true');
});

test('a missing track does not prevent later initialization', () => {
  const { createGallery, observers } = environment();
  const { gallery, track } = createGallery({ connect: false });
  gallery.childrenBySelector.delete('[data-pf-image-gallery-track]');
  gallery.connectedCallback();
  assert.equal(observers.length, 0);
  assert.equal(gallery.dataset.pfImageGalleryReady, undefined);
  gallery.childrenBySelector.set('[data-pf-image-gallery-track]', track);
  gallery.connectedCallback();
  assert.equal(observers.length, 1);
});
