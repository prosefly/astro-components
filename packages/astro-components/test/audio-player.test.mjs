import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {
  formatDuration,
  resolveArtwork,
} from '../dist/server/audio-player.js';

test('formats numeric audio durations', () => {
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

const runtime = await readFile(new URL('../dist/client/audio-player.js', import.meta.url), 'utf8');

class Element extends EventTarget {
  dataset = {};
  childrenBySelector = new Map();
  style = {
    properties: new Map(),
    setProperty(name, value) { this.properties.set(name, value); },
  };
  isConnected = true;
  textContent = '';
  querySelector(selector) { return this.childrenBySelector.get(selector) ?? null; }
  querySelectorAll(selector) { return this.childrenBySelector.get(selector) ?? []; }
}

class Button extends Element {}
class Input extends Element {
  value = '0';
  disabled = true;
}

class Audio extends Element {
  duration = 120;
  currentTime = 0;
  paused = true;
  ended = false;
  controls = true;
  playCalls = 0;
  _muted = false;
  _volume = 1;
  _playbackRate = 1;
  get muted() { return this._muted; }
  set muted(value) { this._muted = value; this.dispatchEvent(new Event('volumechange')); }
  get volume() { return this._volume; }
  set volume(value) { this._volume = value; this.dispatchEvent(new Event('volumechange')); }
  get playbackRate() { return this._playbackRate; }
  set playbackRate(value) { this._playbackRate = value; this.dispatchEvent(new Event('ratechange')); }
  play() {
    this.playCalls++;
    if (this.rejectPlay) return Promise.reject(new Error('Playback denied'));
    this.paused = false;
    this.ended = false;
    this.dispatchEvent(new Event('play'));
    return this.playPromise ?? Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

function environment({ mediaSession = true } = {}) {
  const frames = new Map();
  const observers = [];
  const registry = new Map();
  const session = {
    metadata: null,
    handlers: new Map(),
    setActionHandler(action, handler) { this.handlers.set(action, handler); },
  };
  let frameId = 0;
  const context = {
    HTMLElement: Element,
    HTMLAudioElement: Audio,
    HTMLButtonElement: Button,
    HTMLInputElement: Input,
    AbortController: class extends AbortController {
      constructor() { super(); setMaxListeners(0, this.signal); }
    },
    navigator: mediaSession ? { mediaSession: session } : {},
    MediaMetadata: class { constructor(metadata) { Object.assign(this, metadata); } },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(element) { this.element = element; }
      disconnect() { this.disconnected = true; }
    },
    customElements: {
      get(name) { return registry.get(name); },
      define(name, constructor) { registry.set(name, constructor); },
    },
  };
  vm.runInNewContext(runtime.replace(/^export /gm, '') + '\nglobalThis.Player = AudioPlayerElement;', context);

  function createPlayer({ duration = 120, connect = true, title = 'Episode' } = {}) {
    const player = new context.Player();
    player.dataset = { pfAudioTitle: title, pfAudioDuration: 'Live', pfAudioArtwork: '/cover.webp' };
    const audio = new Audio();
    audio.duration = duration;
    const play = new Button();
    const mute = new Button();
    const rate = new Button();
    const seek = new Input();
    const currentTime = new Element();
    const durationLabel = new Element();
    const backward = new Button();
    backward.dataset.pfAudioSeekBy = '-15';
    const forward = new Button();
    forward.dataset.pfAudioSeekBy = '30';
    const marquee = new Element();
    marquee.clientWidth = 200;
    const content = new Element();
    content.scrollWidth = 500;
    marquee.childrenBySelector.set('[data-pf-audio-marquee-content]', content);
    for (const [selector, element] of [
      ['audio', audio], ['[data-pf-audio-play]', play], ['[data-pf-audio-mute]', mute],
      ['[data-pf-audio-rate]', rate], ['[data-pf-audio-seek]', seek],
      ['[data-pf-audio-current-time]', currentTime], ['[data-pf-audio-duration]', durationLabel],
      ['[data-pf-audio-seek-by]', [backward, forward]], ['[data-pf-audio-marquee]', [marquee]],
    ]) player.childrenBySelector.set(selector, element);
    if (connect) player.connectedCallback();
    return { player, audio, play, mute, rate, seek, currentTime, durationLabel, backward, forward, marquee };
  }

  function tick() {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
  }

  return { createPlayer, frames, observers, registry, session, tick };
}

const emit = (element, event) => element.dispatchEvent(new Event(event));
const click = (element) => emit(element, 'click');
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('registers a custom element and initializes each connection only once', () => {
  const { createPlayer, registry, observers } = environment();
  const { player, audio, rate, durationLabel, seek, marquee } = createPlayer();
  assert.ok(player instanceof registry.get('pf-audio-player'));
  assert.equal(audio.controls, false);
  assert.equal(player.dataset.pfAudioPlayerReady, 'true');
  assert.equal(durationLabel.textContent, '02:00');
  assert.equal(seek.disabled, false);
  assert.equal(marquee.dataset.pfAudioMarqueeActive, 'true');
  player.connectedCallback();
  assert.equal(observers.length, 1);
  click(rate);
  assert.equal(audio.playbackRate, 1.25);
  assert.equal(rate.textContent, '1.25x');
});

test('preserves playback, seek, mute and speed controls without Media Session support', () => {
  const { createPlayer, frames, tick } = environment({ mediaSession: false });
  const { audio, player, play, mute, rate, backward, forward, seek } = createPlayer();
  click(play);
  assert.equal(audio.paused, false);
  assert.equal(play.ariaLabel, 'Pause');
  assert.equal(frames.size, 1);
  audio.currentTime = 30;
  tick();
  assert.equal(seek.value, '25');
  click(backward);
  assert.equal(audio.currentTime, 15);
  click(forward);
  assert.equal(audio.currentTime, 45);
  audio.currentTime = 115;
  click(forward);
  assert.equal(audio.currentTime, 120);
  click(mute);
  assert.equal(player.dataset.pfAudioMuted, 'true');
  assert.equal(mute.ariaLabel, 'Unmute');
  click(mute);
  audio.volume = 0;
  click(mute);
  assert.equal(audio.volume, 1);
  for (const speed of [1.25, 1.5, 2, 0.5, 1]) {
    click(rate);
    assert.equal(audio.playbackRate, speed);
  }
  click(play);
  assert.equal(audio.paused, true);
  assert.equal(frames.size, 0);
});

test('scrubbing updates progress immediately and suspends animation until released', () => {
  const { createPlayer, frames } = environment();
  const { audio, play, seek, currentTime } = createPlayer();
  click(play);
  emit(seek, 'pointerdown');
  assert.equal(frames.size, 0);
  seek.value = '75';
  emit(seek, 'input');
  assert.equal(audio.currentTime, 90);
  assert.equal(seek.style.properties.get('--pf-audio-player-progress'), '75%');
  assert.equal(currentTime.textContent, '01:30');
  // Browser seek completion can lag behind the thumb position.
  audio.currentTime = 80;
  emit(audio, 'timeupdate');
  assert.equal(seek.value, '75');
  assert.equal(currentTime.textContent, '01:30');
  emit(seek, 'change');
  assert.equal(audio.currentTime, 90);
  assert.equal(frames.size, 1);
  emit(seek, 'pointerup');
  assert.equal(frames.size, 1);
});

test('keyboard seeking resumes progress syncing on change or blur', () => {
  const { createPlayer, frames } = environment();
  const { audio, play, seek } = createPlayer();
  click(play);
  for (const event of ['change', 'blur', 'pointercancel']) {
    seek.value = '50';
    emit(seek, 'input');
    assert.equal(audio.currentTime, 60);
    assert.equal(frames.size, 0);
    emit(seek, event);
    assert.equal(frames.size, 1);
  }
});

test('disconnect releases resources and reconnect preserves position without duplicate handlers', () => {
  const { createPlayer, frames, observers, session } = environment();
  const { player, audio, play, rate, seek } = createPlayer();
  click(play);
  audio.currentTime = 45;
  assert.equal(session.metadata.title, 'Episode');
  player.disconnectedCallback();
  assert.equal(audio.paused, true);
  assert.equal(audio.controls, true);
  assert.equal(frames.size, 0);
  assert.equal(observers[0].disconnected, true);
  assert.equal(player.dataset.pfAudioPlayerReady, undefined);
  assert.equal(session.metadata, null);
  assert.ok([...session.handlers.values()].every((handler) => handler === null));
  click(play);
  click(rate);
  seek.value = '90';
  emit(seek, 'input');
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 45);
  assert.equal(audio.playbackRate, 1);
  player.disconnectedCallback();
  player.connectedCallback();
  assert.equal(observers.length, 2);
  assert.equal(audio.controls, false);
  assert.equal(seek.value, '37.5');
  click(play);
  assert.equal(audio.playCalls, 2);
  assert.equal(audio.paused, false);
  click(rate);
  assert.equal(audio.playbackRate, 1.25);
});

test('removing an inactive player does not clear another player Media Session', () => {
  const { createPlayer, session } = environment();
  const first = createPlayer({ title: 'First' });
  const second = createPlayer({ title: 'Second' });
  click(first.play);
  click(second.play);
  first.player.disconnectedCallback();
  assert.equal(session.metadata.title, 'Second');
  session.handlers.get('seekforward')({ seekOffset: 10 });
  assert.equal(second.audio.currentTime, 10);
  session.handlers.get('pause')();
  assert.equal(second.audio.paused, true);
  second.player.disconnectedCallback();
  assert.equal(session.metadata, null);
});

test('unknown duration and incomplete markup retain safe fallback behavior', () => {
  const { createPlayer, observers } = environment();
  const { player, audio, seek, durationLabel, mute } = createPlayer({ duration: NaN, connect: false });
  player.childrenBySelector.delete('[data-pf-audio-mute]');
  player.connectedCallback();
  assert.equal(audio.controls, true);
  assert.equal(player.dataset.pfAudioPlayerReady, undefined);
  assert.equal(observers.length, 0);
  player.childrenBySelector.set('[data-pf-audio-mute]', mute);
  player.connectedCallback();
  assert.equal(seek.disabled, true);
  assert.equal(durationLabel.textContent, 'Live');
  audio.duration = 60;
  emit(audio, 'loadedmetadata');
  assert.equal(seek.disabled, false);
  assert.equal(durationLabel.textContent, '01:00');
});

test('a rejected play request cannot mutate a disconnected player', async () => {
  const { createPlayer, frames } = environment();
  const { player, audio, play } = createPlayer();
  audio.rejectPlay = true;
  click(play);
  await flush();
  assert.equal(play.ariaLabel, 'Play');
  assert.equal(player.dataset.pfAudioPlaying, 'false');
  assert.equal(frames.size, 0);
  click(play);
  player.disconnectedCallback();
  player.dataset.pfAudioPlaying = 'removed';
  await flush();
  assert.equal(player.dataset.pfAudioPlaying, 'removed');
  assert.equal(player.dataset.pfAudioPlayerReady, undefined);
});
