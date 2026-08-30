import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'astro';

const fixtureRoot = fileURLToPath(new URL('./fixtures/basic/', import.meta.url));
const outputRoot = fileURLToPath(new URL('./fixtures/basic/.astro-test-dist/', import.meta.url));

test('public components entry configures an Astro build', async () => {
  rmSync(outputRoot, { force: true, recursive: true });
  try {
    const result = await build({
      root: fixtureRoot,
      outDir: outputRoot,
      logLevel: 'silent',
    });

    assert.equal(result, undefined);
    const html = readFileSync(join(outputRoot, 'index.html'), 'utf8');
    assert.match(html, /pf-image-gallery/);
  } finally {
    rmSync(outputRoot, { force: true, recursive: true });
  }
});
