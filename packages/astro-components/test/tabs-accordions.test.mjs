import assert from 'node:assert/strict';
import { getEventListeners, setMaxListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const runtimes = await Promise.all(['tabs', 'accordions'].map((name) =>
  readFile(new URL(`../dist/client/${name}.js`, import.meta.url), 'utf8'),
));

class Element extends EventTarget {
  tagName = '';
  attributes = new Map();
  children = [];
  textContent = '';
  focusCount = 0;
  get id() { return this.getAttribute('id') ?? ''; }
  set id(value) { this.setAttribute('id', value); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { this.toggleAttribute('hidden', value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  hasAttribute(name) { return this.attributes.has(name); }
  toggleAttribute(name, force) {
    if (force ?? !this.hasAttribute(name)) this.attributes.set(name, '');
    else this.attributes.delete(name);
  }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  matches(selector) {
    if (selector === 'pre code') return this.tagName === 'code' && this.closest('pre');
    if (selector.startsWith('.')) return (this.getAttribute('class') ?? '').split(' ').includes(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) return attribute[2] === undefined
      ? this.hasAttribute(attribute[1])
      : this.getAttribute(attribute[1]) === attribute[2];
    return this.tagName === selector;
  }
  closest(selector) {
    if (this.matches(selector)) return this;
    return this.parent?.closest(selector) ?? null;
  }
  contains(element) {
    return element === this || this.children.some((child) => child.contains(element));
  }
  querySelectorAll(selector) {
    if (selector.startsWith(':scope > ')) return this.children.filter((child) => child.matches(selector.slice(9)));
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  focus() { this.focusCount++; }
}

class Button extends Element {}
class Details extends Element {
  open = false;
}

function element(tag, attributes = {}, Constructor = Element) {
  const node = new Constructor();
  node.tagName = tag;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function environment() {
  const registry = new Map();
  const storage = new Map();
  const writes = [];
  const timers = new Map();
  let timerId = 0;
  const document = new EventTarget();
  const window = Object.assign(new EventTarget(), {
    setTimeout(callback) {
      const id = ++timerId;
      timers.set(id, () => { timers.delete(id); callback(); });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  const context = {
    HTMLElement: Element, Element, HTMLButtonElement: Button, HTMLDetailsElement: Details,
    AbortController: class extends AbortController {
      constructor() { super(); setMaxListeners(0, this.signal); }
    },
    CustomEvent, document, window, location: { hash: '' },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { writes.push([key, value]); storage.set(key, value); },
    },
    navigator: { clipboard: { async writeText(text) { context.copied.push(text); } } },
    copied: [],
    customElements: {
      get(name) { return registry.get(name); },
      define(name, constructor) {
        assert.ok(!registry.has(name), `duplicate registration: ${name}`);
        registry.set(name, constructor);
      },
    },
  };
  vm.createContext(context);
  const load = () => {
    for (const runtime of runtimes) vm.runInContext(`(() => {${runtime.replace(/^export /gm, '')}})()`, context);
  };
  load();
  return { ...context, context, registry, storage, writes, timers, load };
}

function tabs(env, { labels = ['pnpm', 'npm'], syncKey, selected = 0, copy = false } = {}) {
  const root = element('pf-tabs', {}, env.registry.get('pf-tabs'));
  if (syncKey) root.setAttribute('data-sync-key', syncKey);
  const icons = element('div', { class: 'pf-tabs__active-icons' });
  const triggers = [];
  const panels = [];
  for (const [index, label] of labels.entries()) {
    const panelId = `panel-${index}`;
    const trigger = element('button', {
      'data-pf-tabs-trigger': '', 'data-tab-panel': panelId,
      'data-tab-label': label, 'aria-selected': String(index === selected),
    }, Button);
    const panel = element('div', { class: 'pf-tabs__panel', id: panelId });
    panel.hidden = index !== selected;
    const pre = element('pre');
    const code = element('code');
    code.textContent = `${label} install`;
    pre.append(code);
    panel.append(pre);
    icons.append(element('span', { 'data-pf-tabs-icon-for': panelId }));
    triggers.push(trigger);
    panels.push(panel);
    root.append(trigger, panel);
  }
  root.append(icons);
  let button;
  if (copy) {
    button = element('button', { 'data-pf-tabs-copy': '' }, Button);
    button.append(
      element('span', { 'data-pf-tabs-copy-icon': 'copy' }),
      element('span', { 'data-pf-tabs-copy-icon': 'check', hidden: '' }),
    );
    root.append(button);
  }
  return { root, triggers, panels, icons, button };
}

function accordions(env, { multiple = false, defaults = [], open = [] } = {}) {
  const root = element('pf-accordions', { 'data-default-values': JSON.stringify(defaults) }, env.registry.get('pf-accordions'));
  if (multiple) root.setAttribute('data-multiple', 'true');
  const items = ['first', 'second'].map((value) => {
    const item = element('details', { 'data-pf-accordion': '', 'data-value': value, id: value }, Details);
    item.open = open.includes(value);
    item.append(element('summary', { 'data-pf-accordion-trigger': '' }));
    root.append(item);
    return item;
  });
  return { root, items };
}

function click(target) {
  const event = new Event('click', { cancelable: true });
  Object.defineProperty(event, 'target', { value: target });
  for (let current = target; current; current = current.parent) current.dispatchEvent(event);
  return event;
}

function keydown(target, key) {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: key });
  target.dispatchEvent(event);
  return event;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('registers both custom elements once without global page-load initialization', () => {
  const env = environment();
  env.load();
  assert.equal(env.registry.size, 2);
  assert.equal(env.window.__prosefly, undefined);
  assert.equal(getEventListeners(env.document, 'astro:page-load').length, 0);
  assert.equal(getEventListeners(env.window, 'hashchange').length, 0);
});

test('tabs preserve server selection and support clicks and roving keyboard focus', () => {
  const env = environment();
  const { root, triggers, panels, icons } = tabs(env, { selected: 1 });
  root.connectedCallback();
  root.connectedCallback();
  assert.equal(getEventListeners(triggers[0], 'click').length, 1);
  assert.deepEqual(panels.map((panel) => panel.hidden), [true, false]);
  click(triggers[0]);
  assert.deepEqual(panels.map((panel) => panel.hidden), [false, true]);
  assert.deepEqual(triggers.map((trigger) => trigger.getAttribute('tabindex')), ['0', '-1']);
  assert.deepEqual(icons.children.map((icon) => icon.hidden), [false, true]);
  for (const [key, index] of [['ArrowLeft', 1], ['ArrowRight', 0], ['End', 1], ['Home', 0]]) {
    const active = triggers.find((trigger) => trigger.getAttribute('aria-selected') === 'true');
    assert.equal(keydown(active, key).defaultPrevented, true);
    assert.equal(triggers[index].getAttribute('aria-selected'), 'true');
    assert.ok(triggers[index].focusCount > 0);
  }
  assert.equal(keydown(triggers[0], 'Enter').defaultPrevented, false);
});

test('tabs restore persisted labels and synchronize only matching connected groups', () => {
  const env = environment();
  env.storage.set('pf-tabs:package-manager', 'npm');
  const first = tabs(env, { syncKey: 'package-manager' });
  const second = tabs(env, { syncKey: 'package-manager', labels: ['npm', 'pnpm'] });
  const unrelated = tabs(env, { syncKey: 'unrelated' });
  const missing = tabs(env, { syncKey: 'package-manager', labels: ['yarn', 'bun'] });
  for (const group of [first, second, unrelated, missing]) group.root.connectedCallback();
  assert.equal(first.panels[1].hidden, false);
  second.root.disconnectedCallback();
  click(first.triggers[0]);
  assert.equal(second.panels[0].hidden, false);
  assert.equal(unrelated.panels[0].hidden, false);
  assert.equal(missing.panels[0].hidden, false);
  assert.deepEqual(env.writes, [['pf-tabs:package-manager', 'pnpm']]);
  second.root.connectedCallback();
  assert.equal(second.panels[1].hidden, false);
  click(second.triggers[0]);
  assert.equal(first.panels[1].hidden, false);
  assert.equal(first.triggers[1].focusCount, 0);
  assert.equal(env.writes.length, 2);
});

test('tabs remain usable when browser storage is unavailable', () => {
  const env = environment();
  env.localStorage.getItem = () => { throw new Error('blocked'); };
  env.localStorage.setItem = () => { throw new Error('blocked'); };
  const { root, triggers, panels } = tabs(env, { syncKey: 'package-manager' });
  root.connectedCallback();
  click(triggers[1]);
  assert.equal(panels[1].hidden, false);
});

test('nested tabs isolate panels, keyboard controls, icons, and copy buttons', async () => {
  const env = environment();
  const outer = tabs(env, { copy: true });
  const inner = tabs(env, { copy: true });
  outer.panels[0].append(inner.root);
  inner.root.connectedCallback();
  outer.root.connectedCallback();
  click(inner.triggers[1]);
  assert.deepEqual(outer.panels.map((panel) => panel.hidden), [false, true]);
  assert.deepEqual(inner.panels.map((panel) => panel.hidden), [true, false]);
  click(outer.triggers[1]);
  keydown(outer.triggers[1], 'Home');
  assert.deepEqual(inner.panels.map((panel) => panel.hidden), [true, false]);
  assert.equal(getEventListeners(inner.button, 'click').length, 1);
  click(inner.button);
  await flush();
  assert.deepEqual(env.copied, ['npm install']);
  assert.equal(outer.button.getAttribute('aria-label'), null);
  assert.equal(inner.button.getAttribute('aria-label'), 'Copied');
  // Copying an outer panel containing only a nested group's code is a no-op.
  outer.panels[0].children.shift();
  click(outer.button);
  await flush();
  assert.deepEqual(env.copied, ['npm install']);
});

test('tabs copy feedback resets and removal clears timers and event listeners', async () => {
  const env = environment();
  const { root, triggers, button } = tabs(env, { copy: true });
  root.connectedCallback();
  click(button);
  await flush();
  assert.equal(button.getAttribute('aria-label'), 'Copied');
  for (const callback of env.timers.values()) callback();
  assert.equal(button.getAttribute('aria-label'), 'Copy code');
  click(button);
  await flush();
  root.disconnectedCallback();
  assert.equal(env.timers.size, 0);
  assert.equal(button.getAttribute('aria-label'), 'Copy code');
  assert.equal(getEventListeners(button, 'click').length, 0);
  assert.equal(getEventListeners(triggers[0], 'keydown').length, 0);
  assert.equal(getEventListeners(env.document, 'pf-tabs:select').length, 0);
  root.connectedCallback();
  assert.equal(getEventListeners(button, 'click').length, 1);
});

test('clipboard promises from an old connection cannot change reconnected tabs', async () => {
  const env = environment();
  const pending = [];
  env.navigator.clipboard.writeText = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
  const { root, button } = tabs(env, { copy: true });
  root.connectedCallback();
  click(button);
  root.disconnectedCallback();
  root.connectedCallback();
  click(button);
  pending[1].resolve();
  await flush();
  assert.equal(button.getAttribute('aria-label'), 'Copied');
  pending[0].reject(new Error('old request failed'));
  await flush();
  assert.equal(button.getAttribute('aria-label'), 'Copied');
  assert.equal(env.timers.size, 1);
});

test('latest copy request wins and clipboard failures leave no feedback timer', async () => {
  const env = environment();
  const pending = [];
  env.navigator.clipboard.writeText = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
  const { root, button } = tabs(env, { copy: true });
  root.connectedCallback();
  click(button);
  click(button);
  pending[1].reject(new Error('denied'));
  pending[0].resolve();
  await flush();
  assert.equal(button.getAttribute('aria-label'), 'Copy code');
  assert.equal(env.timers.size, 0);
  env.navigator.clipboard = undefined;
  click(button);
  await flush();
  assert.equal(button.getAttribute('aria-label'), 'Copy code');
});

test('tabs preserve unsynchronized selection on reconnect and tolerate empty groups', () => {
  const env = environment();
  const { root, triggers, panels } = tabs(env);
  root.connectedCallback();
  click(triggers[1]);
  root.disconnectedCallback();
  root.connectedCallback();
  assert.equal(panels[1].hidden, false);
  const empty = tabs(env, { labels: [] });
  empty.root.connectedCallback();
  assert.equal(getEventListeners(env.document, 'pf-tabs:select').length, 1);
});

test('accordions apply defaults once, close siblings, and preserve open state on reconnect', () => {
  const env = environment();
  const { root, items } = accordions(env, { defaults: ['first'] });
  root.connectedCallback();
  root.connectedCallback();
  assert.deepEqual(items.map((item) => item.open), [true, false]);
  assert.equal(getEventListeners(items[0], 'toggle').length, 1);
  click(items[1].children[0]);
  assert.equal(items[0].open, false);
  items[1].open = true;
  items[1].dispatchEvent(new Event('toggle'));
  root.disconnectedCallback();
  assert.equal(getEventListeners(items[0], 'click').length, 0);
  assert.equal(getEventListeners(env.window, 'hashchange').length, 0);
  root.connectedCallback();
  assert.deepEqual(items.map((item) => item.open), [false, true]);
  assert.equal(getEventListeners(items[0], 'toggle').length, 1);
});

test('accordions allow multiple defaults and synchronize programmatic native toggles', () => {
  const env = environment();
  const multiple = accordions(env, { multiple: true, defaults: ['first', 'second'] });
  multiple.root.connectedCallback();
  assert.ok(multiple.items.every((item) => item.open));
  multiple.items[1].dispatchEvent(new Event('toggle'));
  assert.ok(multiple.items.every((item) => item.open));
  const single = accordions(env, { open: ['first'] });
  single.root.connectedCallback();
  single.items[1].open = true;
  single.items[1].dispatchEvent(new Event('toggle'));
  assert.deepEqual(single.items.map((item) => item.open), [false, true]);
});

test('accordions prevent disabled summary clicks but not nested accordion interactions', () => {
  const env = environment();
  const outer = accordions(env, { multiple: true, defaults: ['first', 'second'] });
  outer.items[0].setAttribute('data-disabled', 'true');
  const inner = accordions(env);
  outer.items[0].append(inner.root);
  outer.root.connectedCallback();
  inner.root.connectedCallback();
  assert.equal(click(outer.items[0].children[0]).defaultPrevented, true);
  assert.equal(click(inner.items[1].children[0]).defaultPrevented, false);
  assert.ok(outer.items.every((item) => item.open));
  inner.items[1].open = true;
  inner.items[1].dispatchEvent(new Event('toggle'));
  assert.ok(outer.items.every((item) => item.open));
});

test('accordion hashes affect only their owning group and listeners are removed on disconnect', () => {
  const env = environment();
  const first = accordions(env, { defaults: ['first'] });
  const second = accordions(env, { defaults: ['first'] });
  second.items[1].id = '中文';
  env.location.hash = '#%E4%B8%AD%E6%96%87';
  first.root.connectedCallback();
  second.root.connectedCallback();
  assert.deepEqual(first.items.map((item) => item.open), [true, false]);
  assert.deepEqual(second.items.map((item) => item.open), [false, true]);
  first.root.disconnectedCallback();
  env.location.hash = '#second';
  env.window.dispatchEvent(new Event('hashchange'));
  assert.equal(first.items[1].open, false);
  env.location.hash = '#%invalid';
  assert.doesNotThrow(() => env.window.dispatchEvent(new Event('hashchange')));
  assert.equal(getEventListeners(env.window, 'hashchange').length, 1);
});

test('accordions tolerate malformed defaults and empty groups', () => {
  const env = environment();
  for (const defaults of ['{', 'null', '"first"', '{}']) {
    const { root, items } = accordions(env);
    root.setAttribute('data-default-values', defaults);
    root.connectedCallback();
    assert.ok(items.every((item) => !item.open));
    root.disconnectedCallback();
  }
  const empty = element('pf-accordions', {}, env.registry.get('pf-accordions'));
  empty.connectedCallback();
  assert.equal(getEventListeners(env.window, 'hashchange').length, 0);
});
