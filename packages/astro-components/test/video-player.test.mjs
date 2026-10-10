import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { unified, rehypeVideoPlayer } from '../dist/markdown/index.js';
import { resolveVideoPlayerOptions } from '../dist/server/video-player.js';

async function compile(content, options = {}, path = '/fixture/video.mdx') {
  const renderer = await unified({ rehypePlugins: [[rehypeVideoPlayer, options]] })
    .createMdxRenderer({ syntaxHighlight: false }, { optimize: true });
  return (await renderer.process(content, path, {})).code;
}

test('compiles video figures with original attributes, tracks, sources and rich captions', async () => {
  const code = await compile(`<figure id="demo" class="wide" title="Figure title" data-custom="kept">
<video poster="/poster.png" width="1280" height="720" data-duration="15" aria-label="Demo" preload="none" muted>
<source src="/demo.mp4" type="video/mp4" />
<source src="/demo.webm" type="video/webm" />
<track kind="captions" src="/captions.vtt" srcLang="en" />
</video>
<figcaption id="caption" class="credit">A <strong>short</strong> <a href="/demo">demo</a>.</figcaption>
</figure>`);
  assert.match(code, /import \{\s*VideoPlayer as ProseflyVideoPlayer\s*\} from ['"]@prosefly\/astro-components['"]/);
  for (const value of ['demo', 'wide', 'Figure title', 'data-custom', '/poster.png', '/demo.mp4', '/demo.webm', 'video/webm', '/captions.vtt', 'srcLang', 'strong', 'credit']) {
    assert.ok(code.includes(value), value);
  }
  assert.match(code, /figureAttributes:/);
  assert.match(code, /slot: "caption"/);
  assert.match(code, /slot: "media"/);
  assert.match(code, /preload: "none"/);
  assert.match(code, /"data-duration": "15"/);
});

test('compiles MDX expressions and spread figure/video attributes without prop collisions', async () => {
  const code = await compile(`export const figure = {id: 'original', caption: 'attribute'};
export const video = {width: 640};
export const clip = '/demo.mp4';
export const label = 'Demo';

<figure {...figure} data-custom={label} shortVideoSeconds="authored"><video {...video} src={clip} /><figcaption>{label}</figcaption></figure>`);
  assert.match(code, /\.\.\.figure/);
  assert.match(code, /\.\.\.video/);
  assert.match(code, /src: clip/);
  assert.match(code, /children: label/);
  assert.match(code, /"shortVideoSeconds": "authored"/);
  assert.match(code, /shortVideoSeconds: 30/);
});

test('supports source children after an empty source and imports only once', async () => {
  const code = await compile(`<figure><video><source src="" /><source src="/first.mp4" /></video></figure>

<figure><video src="/second.mp4" /></figure>`);
  assert.equal((code.match(/VideoPlayer as ProseflyVideoPlayer/g) ?? []).length, 1);
  assert.ok(code.includes('/first.mp4'));
  assert.ok(code.includes('/second.mp4'));
  assert.ok(!code.includes('slot: "caption"'));
});

test('leaves image, audio, mixed-content, multi-video and missing-source figures alone', async () => {
  const code = await compile(`<figure><img src="/image.png" /><figcaption>Image</figcaption></figure>

<figure><audio src="/audio.mp3" /></figure>

<figure><video src="/demo.mp4" /><p>Additional content</p></figure>

<figure><video src="/one.mp4" /><video src="/two.mp4" /></figure>

<figure><video /></figure>

<figure><video src="" /></figure>

<figure><video src /></figure>

<figure><video src={null} /></figure>

<figure><video src={''} /></figure>`);
  assert.doesNotMatch(code, /VideoPlayer as/);
  assert.ok(code.includes('Additional content'));
});

test('does not transform ordinary Markdown or collide with an existing MDX binding', async () => {
  const markdown = await compile('<figure><video src="/demo.mp4" /></figure>', {}, '/fixture/video.md');
  assert.doesNotMatch(markdown, /VideoPlayer as/);
  const code = await compile(`export const ProseflyVideoPlayer = 'existing';

<figure><video src="/demo.mp4" /></figure>`);
  assert.match(code, /VideoPlayer as ProseflyVideoPlayer1/);
});

test('passes configured duration threshold and localized labels to compiled players', async () => {
  const code = await compile('<figure><video src="/demo.mp4" /></figure>', {
    shortVideoSeconds: 12, labels: { play: '再生', pause: '一時停止' },
  });
  assert.match(code, /shortVideoSeconds: 12/);
  assert.ok(code.includes('再生'));
  assert.ok(code.includes('一時停止'));
  assert.equal(resolveVideoPlayerOptions().shortVideoSeconds, 30);
  assert.equal(resolveVideoPlayerOptions({ shortVideoSeconds: 0 }).shortVideoSeconds, 0);
  for (const value of [-1, NaN, Infinity]) {
    assert.throws(() => resolveVideoPlayerOptions({ shortVideoSeconds: value }), /non-negative/);
  }
});

const runtime = await readFile(new URL('../dist/client/video-player.js', import.meta.url), 'utf8');

class Element extends EventTarget {
  dataset = {};
  attributes = new Map();
  hidden = false;
  childrenBySelector = new Map();
  querySelector(selector) { return this.childrenBySelector.get(selector) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  toggleAttribute(name, force) {
    if (force) this.attributes.set(name, '');
    else this.attributes.delete(name);
  }
}

class Video extends Element {
  duration = 10;
  readyState = 1;
  paused = true;
  muted = false;
  defaultMuted = false;
  autoplay = false;
  controls = true;
  loop = false;
  playCalls = 0;
  play() {
    this.playCalls++;
    if (this.rejectPlay) return Promise.reject(new Error('Autoplay denied'));
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return this.playPromise ?? Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

function fixture({ duration = 10, durationHint, audio = 'present', reducedMotion = false, threshold = 30, observe = true } = {}) {
  const video = new Video();
  video.duration = duration;
  if (durationHint !== undefined) video.dataset.duration = String(durationHint);
  if (audio === 'present' || audio === 'absent') {
    video.audioTracks = Object.assign(new EventTarget(), { length: audio === 'present' ? 1 : 0 });
  } else if (audio === 'decoded') video.webkitAudioDecodedByteCount = 0;
  else if (audio === 'moz-present' || audio === 'moz-absent') video.mozHasAudio = audio === 'moz-present';
  const document = Object.assign(new Element(), { hidden: false });
  const motion = Object.assign(new Element(), { matches: reducedMotion });
  const observers = [];
  const context = {
    HTMLElement: Element, AbortController, document,
    window: { matchMedia: () => motion },
    customElements: { get() {}, define() {} },
    ...(observe ? {
      IntersectionObserver: class {
        constructor(callback) { observers.push(this); this.callback = callback; }
        observe() {}
        disconnect() { this.disconnected = true; }
        visible(value) { this.callback([{ isIntersecting: value, intersectionRatio: value ? 1 : 0 }]); }
      },
    } : {}),
  };
  vm.runInNewContext(runtime.replace(/^export /gm, '') + '\nglobalThis.Player = VideoPlayerElement;', context);
  const player = new context.Player();
  player.dataset.shortVideoSeconds = String(threshold);
  const actions = new Element();
  const playback = new Element();
  playback.dataset = { playLabel: 'Play', pauseLabel: 'Pause' };
  const sound = new Element();
  sound.dataset = { muteLabel: 'Mute', unmuteLabel: 'Unmute' };
  player.childrenBySelector.set('video', video);
  player.childrenBySelector.set('[data-pf-video-actions]', actions);
  player.childrenBySelector.set('[data-pf-video-playback]', playback);
  player.childrenBySelector.set('[data-pf-video-sound]', sound);
  for (const icon of ['play', 'pause', 'muted', 'audible']) {
    player.childrenBySelector.set(`[data-pf-video-icon="${icon}"]`, new Element());
  }
  player.connectedCallback();
  return { player, video, actions, playback, sound, document, motion, observers, observer: observers[0] };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const click = (element) => element.dispatchEvent(new Event('click'));

test('short clips loop muted only while visible and keep a manual pause across visibility changes', async () => {
  const { player, video, observer, playback, sound, document } = fixture();
  assert.equal(player.dataset.mode, 'loop');
  assert.equal(video.loop, true);
  assert.equal(video.muted, true);
  assert.equal(video.paused, true);
  assert.equal(video.controls, false);
  observer.visible(true);
  await flush();
  assert.equal(video.paused, false);
  assert.equal(playback.attributes.get('aria-label'), 'Pause');
  click(sound);
  assert.equal(video.muted, false);
  assert.equal(sound.attributes.get('aria-label'), 'Mute');
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(video.paused, true);
  assert.equal(video.muted, true);
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(video.paused, false);
  click(playback);
  observer.visible(false);
  observer.visible(true);
  await flush();
  assert.equal(video.paused, true);
  assert.equal(playback.attributes.get('aria-label'), 'Play');
  click(playback);
  await flush();
  assert.equal(video.paused, false);
});

test('long and unknown-duration videos retain native controls without autoplay or looping', () => {
  for (const duration of [31, NaN, Infinity, 0]) {
    const { player, video, actions, observer } = fixture({ duration });
    observer.visible(true);
    assert.equal(player.dataset.mode, 'player');
    assert.equal(video.controls, true);
    assert.equal(video.loop, false);
    assert.equal(video.autoplay, false);
    assert.equal(video.playCalls, 0);
    assert.equal(actions.hidden, true);
  }
});

test('duration metadata overrides hints and the configurable threshold includes its boundary', () => {
  const { player, video } = fixture({ duration: 12, threshold: 12 });
  assert.equal(player.dataset.mode, 'loop');
  video.duration = 13;
  video.dispatchEvent(new Event('durationchange'));
  assert.equal(player.dataset.mode, 'player');
  assert.equal(video.controls, true);
  const disabled = fixture({ threshold: 0 });
  assert.equal(disabled.video.loop, false);
});

test('duration hints configure clips until finite browser metadata takes precedence', () => {
  const hinted = fixture({ duration: NaN, durationHint: 15 });
  assert.equal(hinted.player.dataset.mode, 'loop');
  hinted.video.duration = 60;
  hinted.video.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(hinted.player.dataset.mode, 'player');
  const actual = fixture({ duration: 60, durationHint: 15 });
  assert.equal(actual.player.dataset.mode, 'player');
});

test('reduced motion requires manual playback and pauses an automatically playing clip when enabled', async () => {
  const reduced = fixture({ reducedMotion: true });
  reduced.observer.visible(true);
  assert.equal(reduced.video.playCalls, 0);
  click(reduced.playback);
  await flush();
  assert.equal(reduced.video.paused, false);
  const automatic = fixture();
  automatic.observer.visible(true);
  await flush();
  automatic.motion.matches = true;
  automatic.motion.dispatchEvent(new Event('change'));
  assert.equal(automatic.video.paused, true);
});

test('confirmed silent clips hide sound; unknown tracks retain native audio controls', async () => {
  const silent = fixture({ audio: 'absent' });
  assert.equal(silent.sound.hidden, true);
  assert.equal(silent.actions.hidden, false);
  assert.equal(silent.video.controls, false);
  const unknown = fixture({ audio: 'unknown' });
  assert.equal(unknown.video.controls, true);
  assert.equal(unknown.actions.hidden, true);
  const decoded = fixture({ audio: 'decoded' });
  decoded.observer.visible(true);
  await flush();
  assert.equal(decoded.video.controls, true); // zero decoded bytes is not proof of silence
  decoded.video.webkitAudioDecodedByteCount = 100;
  decoded.video.dispatchEvent(new Event('timeupdate'));
  assert.equal(decoded.sound.hidden, false);
  assert.equal(decoded.video.controls, false);
  assert.equal(decoded.actions.hidden, false);
});

test('track changes update audio controls and caption tracks retain native selection', () => {
  const { video, sound } = fixture({ audio: 'absent' });
  video.audioTracks.length = 1;
  video.audioTracks.dispatchEvent(new Event('addtrack'));
  assert.equal(sound.hidden, false);
  video.childrenBySelector.set('track', new Element());
  video.dispatchEvent(new Event('loadeddata'));
  assert.equal(video.controls, true);
});

test('Firefox audio hints are only trusted once media metadata is ready', () => {
  const present = fixture({ audio: 'moz-present' });
  assert.equal(present.sound.hidden, false);
  const absent = fixture({ audio: 'moz-absent' });
  assert.equal(absent.sound.hidden, true);
  assert.equal(absent.video.controls, false);
  absent.video.readyState = 0;
  absent.video.dispatchEvent(new Event('loadeddata'));
  assert.equal(absent.player.dataset.audio, 'unknown');
  assert.equal(absent.video.controls, true);
});

test('native manual pause survives leaving and returning to the viewport', async () => {
  const { video, observer } = fixture({ audio: 'unknown' });
  observer.visible(true);
  await flush();
  video.pause();
  observer.visible(false);
  observer.visible(true);
  await flush();
  assert.equal(video.paused, true);
  assert.equal(video.controls, true);
});

test('autoplay rejection remains manually playable and no observer means no automatic playback', async () => {
  const denied = fixture();
  denied.video.rejectPlay = true;
  denied.observer.visible(true);
  await flush();
  assert.equal(denied.playback.attributes.get('aria-label'), 'Play');
  assert.equal(denied.actions.hidden, false);
  denied.video.rejectPlay = false;
  click(denied.playback);
  await flush();
  assert.equal(denied.video.paused, false);
  const fallback = fixture({ observe: false });
  assert.equal(fallback.video.playCalls, 0);
  click(fallback.playback);
  await flush();
  assert.equal(fallback.video.paused, false);
});

test('source changes reset looping; disconnect cleans observers/listeners and pauses playback', async () => {
  const { player, video, observer } = fixture();
  observer.visible(true);
  await flush();
  video.duration = NaN;
  video.readyState = 0;
  video.dispatchEvent(new Event('emptied'));
  assert.equal(player.dataset.mode, 'player');
  assert.equal(video.loop, false);
  assert.equal(video.controls, true);
  video.duration = 10;
  video.readyState = 1;
  video.dispatchEvent(new Event('loadedmetadata'));
  await flush();
  assert.equal(video.paused, false);
  player.disconnectedCallback();
  assert.equal(observer.disconnected, true);
  assert.equal(video.paused, true);
  const calls = video.playCalls;
  video.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(video.playCalls, calls);
});

test('pending play requests cannot resume an invisible or disconnected clip', async () => {
  for (const disconnect of [false, true]) {
    const { player, video, observer } = fixture();
    let settle;
    video.playPromise = new Promise((resolve) => { settle = resolve; });
    observer.visible(true);
    if (disconnect) player.disconnectedCallback();
    else observer.visible(false);
    video.paused = false; // emulate a late browser play completion
    settle();
    await flush();
    assert.equal(video.paused, true);
  }
});

test('reconnection does not duplicate controls or let an old play promise stop new playback', async () => {
  const { player, video, observer, observers, playback } = fixture();
  let settle;
  video.playPromise = new Promise((resolve) => { settle = resolve; });
  observer.visible(true);
  player.disconnectedCallback();
  video.playPromise = undefined;
  player.connectedCallback();
  player.connectedCallback(); // duplicate notifications must not attach duplicate listeners
  observers.at(-1).visible(true);
  settle();
  await flush();
  assert.equal(video.paused, false);
  assert.equal(video.playCalls, 2);
  click(playback);
  assert.equal(video.paused, true);
  assert.equal(video.playCalls, 2);
  assert.equal(playback.attributes.get('aria-label'), 'Play');
});
