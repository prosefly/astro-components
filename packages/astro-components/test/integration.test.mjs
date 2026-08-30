import assert from 'node:assert/strict';
import test from 'node:test';
import proseflyComponents from '@prosefly/astro-components/integration';
import icon from '../dist/icon/index.js';
import {
  rehypeImageGallery,
  remarkCalloutDirectives,
  remarkPackageManagerTabs,
  unified,
} from '../dist/markdown/index.js';

const setup = async (options, markdown = {}) => {
  const integration = proseflyComponents(options);
  const updates = [];
  const scripts = [];
  const middlewares = [];
  await integration.hooks['astro:config:setup']({
    config: {
      integrations: [integration],
      markdown,
      root: new URL('./', import.meta.url),
      srcDir: new URL('./', import.meta.url),
    },
    addMiddleware: (middleware) => middlewares.push(middleware),
    injectScript: (stage, content) => scripts.push([stage, content]),
    updateConfig: (update) => updates.push(update),
  });
  return { middlewares, scripts, updates };
};

test('components defaults enable transforms and gallery assets', async () => {
  const result = await setup({ icons: false });
  const processor = result.updates[0].markdown.processor;

  assert.equal(processor.options.remarkPlugins.length, 2);
  assert.equal(processor.options.rehypePlugins.length, 1);
  assert.equal(result.scripts.length, 1);
  assert.match(result.scripts[0][1], /image-gallery/);
});

test('disabled markdown features register no transforms or assets', async () => {
  const result = await setup({
    icons: false,
    markdown: {
      calloutDirectives: false,
      packageManagerTabs: false,
      imageGallery: false,
    },
  });
  const processor = result.updates[0].markdown.processor;

  assert.deepEqual(processor.options.remarkPlugins, []);
  assert.deepEqual(processor.options.rehypePlugins, []);
  assert.deepEqual(result.scripts, []);
});

test('preserves unified processor options and extension ordering', async () => {
  function before() {}
  function userRemark() {}
  function after() {}
  function userRehype() {}
  const existing = unified({
    remarkPlugins: [userRemark],
    rehypePlugins: [userRehype],
    gfm: false,
    smartypants: false,
    remarkRehype: { allowDangerousHtml: true },
  });
  const result = await setup({
    icons: false,
    markdown: {
      remarkPluginsBeforeTransforms: [before],
      remarkPluginsAfterTransforms: [after],
      rehypePluginsAfterTransforms: [after],
    },
  }, { processor: existing });
  const processor = result.updates[0].markdown.processor;

  assert.deepEqual(processor.options.remarkPlugins, [
    before,
    remarkCalloutDirectives,
    userRemark,
    remarkPackageManagerTabs,
    after,
  ]);
  assert.equal(processor.options.gfm, false);
  assert.equal(processor.options.smartypants, false);
  assert.deepEqual(processor.options.remarkRehype, { allowDangerousHtml: true });
  assert.deepEqual(processor.options.rehypePlugins, [
    userRehype,
    rehypeImageGallery,
    after,
  ]);
});

test('preserves custom processors without injecting incompatible gallery assets', async () => {
  const customProcessor = {
    name: 'custom',
    options: {},
    createRenderer: async () => ({ render: async () => ({ code: '', metadata: {} }) }),
  };
  const result = await setup({ icons: false }, { processor: customProcessor });

  assert.equal(result.updates[0].markdown.processor, customProcessor);
  assert.deepEqual(result.scripts, []);
});

test('replaces Astro default satteri processor with the shared unified pipeline', async () => {
  const defaultProcessor = {
    name: 'satteri',
    options: { mdastPlugins: [], hastPlugins: [], features: {} },
    createRenderer: async () => ({ render: async () => ({ code: '', metadata: {} }) }),
  };
  const result = await setup({ icons: false }, { processor: defaultProcessor });
  const processor = result.updates[0].markdown.processor;

  assert.equal(processor.name, 'unified');
  assert.ok(processor.options.remarkPlugins.includes(remarkCalloutDirectives));
  assert.equal(result.scripts.length, 1);
});

test('does not compose shared transforms twice when preconfigured before MDX', async () => {
  const first = await setup({ icons: false });
  const second = await setup({ icons: false }, first.updates[0].markdown);

  assert.deepEqual(second.updates, []);
  assert.equal(second.scripts.length, 1);
});

test('diagnoses duplicate root registrations', async () => {
  const first = proseflyComponents();
  const second = proseflyComponents();

  await assert.rejects(
    first.hooks['astro:config:setup']({
      config: { integrations: [first, second], markdown: {} },
      addMiddleware() {},
      injectScript() {},
      updateConfig() {},
    }),
    /registered 2 times/,
  );
});

test('icon compatibility wrapper uses the shared icon setup', async () => {
  const standalone = icon({ scan: false, preload: ['lucide:star'] });
  const root = proseflyComponents({
    markdown: false,
    icons: { scan: false, preload: ['lucide:star'] },
  });
  const collect = async (integration) => {
    const updates = [];
    const middlewares = [];
    await integration.hooks['astro:config:setup']({
      config: { integrations: [integration], markdown: {} },
      addMiddleware: (middleware) => middlewares.push(middleware),
      updateConfig: (update) => updates.push(update),
    });
    return { updates, middlewares };
  };
  const [standaloneResult, rootResult] = await Promise.all([
    collect(standalone),
    collect(root),
  ]);

  assert.equal(standaloneResult.middlewares.length, 1);
  assert.equal(rootResult.middlewares.length, 1);
  assert.deepEqual(
    standaloneResult.updates[0].vite.plugins.map((plugin) => plugin.name),
    rootResult.updates[0].vite.plugins.map((plugin) => plugin.name),
  );
});
