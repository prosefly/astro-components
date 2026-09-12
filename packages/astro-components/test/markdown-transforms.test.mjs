import assert from 'node:assert/strict';
import test from 'node:test';
import * as expressiveCodePublic from '../dist/expressive-code/index.js';
import {
  expressiveCodeHeaderIcons,
  getCodeBlockLanguageLabel,
  resolveCodeHeaderIcon,
} from '../dist/expressive-code/header-icons.js';
import * as markdownPublic from '../dist/markdown/index.js';
import {
  rehypeMermaid,
  remarkCalloutDirectives,
  remarkImageGallery,
  remarkPackageManagerTabs,
} from '../dist/markdown/index.js';

test('Expressive Code helpers are not part of public entry points', () => {
  assert.deepEqual(Object.keys(expressiveCodePublic).sort(), [
    'expressiveCodeHeaderIcons',
  ]);

  for (const name of [
    'expressiveCodeHeaderIconNames',
    'getExpressiveCodeHeaderIconNames',
    'getCodeBlockLanguageLabel',
    'resolveCodeHeaderIcon',
  ]) {
    assert.equal(name in expressiveCodePublic, false);
    assert.equal(name in markdownPublic, false);
  }
});

function runPlugin(plugin, tree, file = {}) {
  const usedPlugins = [];
  const transformer = plugin.call({
    use(usedPlugin, options) {
      usedPlugins.push([usedPlugin, options]);
    },
  });

  if (typeof transformer === 'function') {
    transformer(tree, file);
  }

  return { tree, usedPlugins };
}

function getAttribute(node, name) {
  return node.attributes?.find((attribute) => attribute.name === name)?.value;
}

function getCodeText(tabItem) {
  return tabItem.children[0].value;
}

function findNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
}

function mermaidCode(source, meta) {
  return {
    type: 'element',
    tagName: 'pre',
    position: { start: { line: 4 } },
    properties: {},
    children: [
      {
        type: 'element',
        tagName: 'code',
        properties: {
          className: ['language-mermaid'],
          ...(meta ? { metastring: meta } : {}),
        },
        children: [{ type: 'text', value: `${source}\n` }],
      },
    ],
  };
}

test('rehypeMermaid renders a Mermaid code block as a themed SVG', () => {
  const root = {
    type: 'root',
    children: [
      mermaidCode('flowchart LR\n  Author --> SVG', 'title="Publishing flow"'),
    ],
  };

  runPlugin(rehypeMermaid, root, { path: '/docs/diagrams.md' });

  const figure = root.children[0];
  const svg = figure.children[0];
  const title = svg.children[0];
  const style = findNode(svg, (node) => node.tagName === 'style');
  const marker = findNode(svg, (node) => node.tagName === 'marker');
  const edge = findNode(svg, (node) => node.tagName === 'polyline');

  assert.equal(figure.tagName, 'figure');
  assert.deepEqual(figure.properties.className, ['pf-mermaid']);
  assert.equal(svg.tagName, 'svg');
  assert.equal(svg.properties.role, 'img');
  assert.match(svg.properties.style, /--bg:var\(--pf-background, #ffffff\)/);
  assert.match(svg.properties.style, /max-width:100%/);
  assert.equal(title.children[0].value, 'Publishing flow');
  assert.equal(svg.properties.ariaLabelledBy, title.properties.id);
  assert.doesNotMatch(style.children[0].value, /fonts\.googleapis\.com/);
  assert.match(style.children[0].value, /--pf-font-sans/);
  assert.match(marker.properties.id, /^pf-mermaid-[a-f0-9]{8}-1-arrowhead$/);
  assert.equal(edge.properties.markerEnd, `url(#${marker.properties.id})`);
});

test('rehypeMermaid gives repeated diagrams unique SVG ids', () => {
  const source = 'flowchart LR\n  A --> B';
  const root = {
    type: 'root',
    children: [mermaidCode(source), mermaidCode(source)],
  };

  runPlugin(rehypeMermaid, root);

  const firstMarker = findNode(
    root.children[0],
    (node) => node.tagName === 'marker',
  );
  const secondMarker = findNode(
    root.children[1],
    (node) => node.tagName === 'marker',
  );

  assert.notEqual(firstMarker.properties.id, secondMarker.properties.id);
});

test('rehypeMermaid leaves other code blocks unchanged', () => {
  const root = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'pre',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'code',
            properties: { className: ['language-js'] },
            children: [{ type: 'text', value: 'console.log(1)\n' }],
          },
        ],
      },
    ],
  };
  const original = structuredClone(root);

  runPlugin(rehypeMermaid, root);

  assert.deepEqual(root, original);
});

test('rehypeMermaid reports the source location for invalid diagrams', () => {
  const root = {
    type: 'root',
    children: [mermaidCode('gantt\n  title Unsupported')],
  };

  assert.throws(
    () => runPlugin(rehypeMermaid, root, { path: '/docs/diagrams.md' }),
    /Failed to render Mermaid diagram in \/docs\/diagrams\.md:4/,
  );
});

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
  assert.equal(tabs.name, 'ProseflyPackageManagerTabs');
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

test('remarkPackageManagerTabs converts commands nested in Steps', () => {
  const root = {
    type: 'root',
    children: [
      {
        type: 'mdxJsxFlowElement',
        name: 'Steps',
        attributes: [],
        children: [
          {
            type: 'list',
            children: [
              {
                type: 'listItem',
                children: [
                  {
                    type: 'code',
                    lang: 'sh',
                    value: 'npm install @prosefly/astro-components',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  runPlugin(remarkPackageManagerTabs, root);

  const tabs = findNode(
    root,
    (node) => node.name === 'ProseflyPackageManagerTabs',
  );
  assert.ok(tabs);
  assert.equal(root.children[0].type, 'mdxjsEsm');
  assert.equal(getAttribute(tabs, 'syncKey'), 'package-manager');
});

test('remarkPackageManagerTabs does not create nested tabs', () => {
  const code = {
    type: 'code',
    lang: 'sh',
    value: 'npm install @prosefly/astro-components',
  };
  const root = {
    type: 'root',
    children: [
      {
        type: 'mdxJsxFlowElement',
        name: 'Tabs',
        attributes: [],
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'TabItem',
            attributes: [],
            children: [code],
          },
        ],
      },
    ],
  };

  runPlugin(remarkPackageManagerTabs, root);

  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].children[0].children[0], code);
});

for (const file of [{ path: '/docs/images.mdx' }, { path: '/docs/images.md' }, {}]) {
  test(`remarkImageGallery converts image-only paragraphs (${file.path ?? 'no file metadata'})`, () => {
    const root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'image',
              alt: 'Light mode',
              title: 'Light',
              url: '/light.png',
            },
            { type: 'text', value: ' ' },
            {
              type: 'imageReference',
              alt: 'Dark mode',
              identifier: 'dark',
              label: 'dark',
            },
          ],
        },
      ],
    };

    runPlugin(remarkImageGallery, root, file);

    assert.equal(root.children[0].type, 'mdxjsEsm');
    assert.match(root.children[0].value, /ImageGallery as ProseflyImageGallery/);
    const gallery = root.children[1];
    assert.equal(gallery.type, 'mdxJsxFlowElement');
    assert.equal(gallery.name, 'ProseflyImageGallery');
    assert.equal(gallery.children.length, 3);
    assert.equal(gallery.children[0].type, 'image');
    assert.equal(gallery.children[0].url, '/light.png');
    assert.equal(gallery.children[0].title, 'Light');
    assert.equal(gallery.children[1].type, 'text');
    assert.equal(gallery.children[1].value, ' ');
    assert.equal(gallery.children[2].type, 'imageReference');
  });

}

test('remarkImageGallery leaves mixed-content paragraphs unchanged', () => {
  const root = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Screenshot: ' },
          { type: 'image', alt: 'Screenshot', url: '/screenshot.png' },
        ],
      },
    ],
  };

  runPlugin(remarkImageGallery, root, { path: '/docs/images.md' });

  assert.equal(root.children[0].type, 'paragraph');
});

test('expressiveCodeHeaderIcons inserts an icon into rendered frame headers', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        prefix: 'vscode-icons',
        icons: {
          'file-type-typescript': {
            body: '<path fill="#3178c6" d="M0 0h24v24H0z"/>',
            height: 24,
            width: 24,
          },
        },
      }),
      {
        headers: { 'content-type': 'application/json' },
        status: 200,
      },
    );

  try {
    const plugin = expressiveCodeHeaderIcons({
      apiBase: 'https://icons.example.test',
    });
    const header = {
      type: 'element',
      tagName: 'figcaption',
      properties: { className: ['header'] },
      children: [
        {
          type: 'element',
          tagName: 'span',
          properties: { className: ['title'] },
          children: [{ type: 'text', value: 'src/index.ts' }],
        },
      ],
    };
    const blockAst = {
      type: 'element',
      tagName: 'figure',
      properties: { className: ['frame', 'has-title'] },
      children: [header],
    };

    await plugin.hooks.postprocessRenderedBlock({
      codeBlock: {
        language: 'ts',
        props: { title: 'src/index.ts' },
      },
      renderData: { blockAst },
    });

    assert.equal(header.children[0].tagName, 'span');
    assert.deepEqual(header.children[0].properties.className, [
      'pf-code-header-icon',
    ]);
    assert.equal(header.children[0].children[0].tagName, 'img');
    assert.match(
      header.children[0].children[0].properties.src,
      /^data:image\/svg\+xml,/,
    );
    assert.deepEqual(header.children[1].properties.className, ['title']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('expressiveCodeHeaderIcons inserts a language label when no title is present', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        prefix: 'vscode-icons',
        icons: {
          'file-type-typescript': {
            body: '<path fill="#3178c6" d="M0 0h24v24H0z"/>',
            height: 24,
            width: 24,
          },
        },
      }),
      {
        headers: { 'content-type': 'application/json' },
        status: 200,
      },
    );

  try {
    const plugin = expressiveCodeHeaderIcons({
      apiBase: 'https://icons.example.test',
    });
    const header = {
      type: 'element',
      tagName: 'figcaption',
      properties: { className: ['header'] },
      children: [],
    };
    const blockAst = {
      type: 'element',
      tagName: 'figure',
      properties: { className: ['frame'] },
      children: [header],
    };

    await plugin.hooks.postprocessRenderedBlock({
      codeBlock: {
        language: 'ts',
        props: {},
      },
      renderData: { blockAst },
    });

    assert.deepEqual(header.children[0].properties.className, [
      'pf-code-header-icon',
    ]);
    assert.deepEqual(header.children[1].properties.className, [
      'pf-code-header-language',
    ]);
    assert.equal(header.children[1].children[0].value, 'typescript');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getCodeBlockLanguageLabel expands common language aliases', () => {
  assert.equal(getCodeBlockLanguageLabel('py'), 'python');
  assert.equal(getCodeBlockLanguageLabel('md'), 'markdown');
  assert.equal(getCodeBlockLanguageLabel('ts'), 'typescript');
  assert.equal(getCodeBlockLanguageLabel('custom-language'), 'custom-language');
  assert.equal(getCodeBlockLanguageLabel(undefined), undefined);
});

test('expressiveCodeHeaderIcons skips terminal frames', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response('{}', { status: 200 });
  };

  try {
    const plugin = expressiveCodeHeaderIcons({
      apiBase: 'https://icons.example.test',
    });
    const header = {
      type: 'element',
      tagName: 'figcaption',
      properties: { className: ['header'] },
      children: [
        {
          type: 'element',
          tagName: 'span',
          properties: { className: ['title'] },
          children: [{ type: 'text', value: 'Terminal window' }],
        },
      ],
    };
    const blockAst = {
      type: 'element',
      tagName: 'figure',
      properties: { className: ['frame', 'is-terminal'] },
      children: [header],
    };

    await plugin.hooks.postprocessRenderedBlock({
      codeBlock: {
        language: 'sh',
        props: {},
      },
      renderData: { blockAst },
    });

    assert.equal(fetchCalled, false);
    assert.equal(header.children.length, 1);
    assert.deepEqual(header.children[0].properties.className, ['title']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveCodeHeaderIcon falls back from title to language', () => {
  assert.equal(
    resolveCodeHeaderIcon({
      language: 'json',
      props: { title: 'package.json' },
    }).name,
    'vscode-icons:file-type-npm',
  );
  assert.equal(
    resolveCodeHeaderIcon({ language: 'ts', props: {} }).name,
    'vscode-icons:file-type-typescript',
  );
});
