import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rehypeImageGallery,
  remarkCalloutDirectives,
  remarkPackageManagerTabs,
} from '../dist/markdown/index.js';

function runPlugin(plugin, tree) {
  const usedPlugins = [];
  const transformer = plugin.call({
    use(usedPlugin, options) {
      usedPlugins.push([usedPlugin, options]);
    },
  });

  if (typeof transformer === 'function') {
    transformer(tree);
  }

  return { tree, usedPlugins };
}

function getAttribute(node, name) {
  return node.attributes?.find((attribute) => attribute.name === name)?.value;
}

function getCodeText(tabItem) {
  return tabItem.children[0].children[0].children[0].children[0].value;
}

test('remarkCalloutDirectives converts container directives to Callout MDX nodes', () => {
  const root = {
    type: 'root',
    children: [
      {
        type: 'containerDirective',
        name: 'tip',
        attributes: {},
        children: [
          {
            type: 'paragraph',
            data: { directiveLabel: true },
            children: [{ type: 'text', value: 'Cache result' }],
          },
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'Use the cached value.' }],
          },
        ],
      },
    ],
  };

  const { tree, usedPlugins } = runPlugin(remarkCalloutDirectives, root);

  assert.equal(usedPlugins.length, 1);
  assert.equal(tree.children[0].type, 'mdxjsEsm');
  assert.match(tree.children[0].value, /ProseflyDirectiveCallout/);

  const callout = tree.children[1];
  assert.equal(callout.type, 'mdxJsxFlowElement');
  assert.equal(callout.name, 'ProseflyDirectiveCallout');
  assert.equal(getAttribute(callout, 'type'), 'tip');
  assert.equal(getAttribute(callout, 'title'), 'Cache result');
  assert.deepEqual(callout.children, [
    {
      type: 'paragraph',
      children: [{ type: 'text', value: 'Use the cached value.' }],
    },
  ]);
});

test('remarkCalloutDirectives maps caution to warning and supports title attributes', () => {
  const root = {
    type: 'root',
    children: [
      {
        type: 'containerDirective',
        name: 'caution',
        attributes: { title: 'Careful' },
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'This can break output.' }],
          },
        ],
      },
    ],
  };

  runPlugin(remarkCalloutDirectives, root);
  const callout = root.children[1];

  assert.equal(getAttribute(callout, 'type'), 'warning');
  assert.equal(getAttribute(callout, 'title'), 'Careful');
});

test('remarkPackageManagerTabs converts supported npm commands to package manager tabs', () => {
  const root = {
    type: 'root',
    children: [
      {
        type: 'code',
        lang: 'sh',
        value: 'npm install --save-dev typescript',
      },
    ],
  };

  runPlugin(remarkPackageManagerTabs, root);

  assert.equal(root.children[0].type, 'mdxjsEsm');
  const tabs = root.children[1];
  assert.equal(tabs.name, 'LotusPackageManagerTabs');
  assert.equal(getAttribute(tabs, 'syncKey'), 'package-manager');

  const commands = Object.fromEntries(
    tabs.children.map((tabItem) => [
      getAttribute(tabItem, 'label'),
      getCodeText(tabItem),
    ]),
  );

  assert.deepEqual(commands, {
    bun: 'bun add -d typescript',
    npm: 'npm install --save-dev typescript',
    pnpm: 'pnpm add -D typescript',
    yarn: 'yarn add -D typescript',
  });
});

test('rehypeImageGallery converts image-only paragraphs to accessible gallery figures', () => {
  const root = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'p',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'img',
            properties: { alt: 'Light mode', src: '/light.png' },
            children: [],
          },
          { type: 'text', value: '\n' },
          {
            type: 'element',
            tagName: 'img',
            properties: { alt: 'Dark mode', src: '/dark.png' },
            children: [],
          },
        ],
      },
    ],
  };

  runPlugin(rehypeImageGallery, root);

  const figure = root.children[0];
  assert.equal(figure.tagName, 'figure');
  assert.deepEqual(figure.properties.className, ['pf-image-gallery']);
  assert.equal(figure.properties.dataImageCount, '2');
  assert.equal(figure.children[0].tagName, 'button');
  assert.equal(figure.children[0].properties.ariaLabel, 'Previous image');
  assert.equal(figure.children[1].properties.dataPfImageGalleryTrack, '');
  assert.equal(figure.children[2].properties.ariaLabel, 'Next image');
});
