import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatDuration,
  resolveArtwork,
} from '../dist/server/media-player.js';

test('formats numeric media durations', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(65), '01:05');
  assert.equal(formatDuration(3661), '01:01:01');
});

test('preserves formatted durations and handles unknown values', () => {
  assert.equal(formatDuration('Live'), 'Live');
  assert.equal(formatDuration(), '--:--');
  assert.equal(formatDuration(Number.POSITIVE_INFINITY), '--:--');
});

test('resolves string and imported artwork sources', () => {
  assert.equal(resolveArtwork('/cover.webp'), '/cover.webp');
  assert.equal(resolveArtwork({ src: '/imported.webp' }), '/imported.webp');
  assert.equal(resolveArtwork(), undefined);
});
