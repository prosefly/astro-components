interface VideoWithAudio extends HTMLVideoElement {
  audioTracks?: EventTarget & { length: number };
  mozHasAudio?: boolean;
  webkitAudioDecodedByteCount?: number;
}

/** Unknown audio must retain native controls rather than be treated as silent. */
export function detectVideoAudio(video: VideoWithAudio): 'present' | 'absent' | 'unknown' {
  if (video.readyState < 1) return 'unknown';
  if (video.audioTracks) return video.audioTracks.length > 0 ? 'present' : 'absent';
  if (typeof video.mozHasAudio === 'boolean') return video.mozHasAudio ? 'present' : 'absent';
  if ((video.webkitAudioDecodedByteCount ?? 0) > 0) return 'present';
  return 'unknown';
}

export class VideoPlayerElement extends HTMLElement {
  private observer?: IntersectionObserver;
  private events?: AbortController;

  connectedCallback() {
    if (this.events) return;
    const video = this.querySelector<VideoWithAudio>('video');
    const actions = this.querySelector<HTMLElement>('[data-pf-video-actions]');
    const playback = this.querySelector<HTMLButtonElement>('[data-pf-video-playback]');
    const sound = this.querySelector<HTMLButtonElement>('[data-pf-video-sound]');
    const playIcon = this.querySelector<SVGElement>('[data-pf-video-icon="play"]');
    const pauseIcon = this.querySelector<SVGElement>('[data-pf-video-icon="pause"]');
    const mutedIcon = this.querySelector<SVGElement>('[data-pf-video-icon="muted"]');
    const audibleIcon = this.querySelector<SVGElement>('[data-pf-video-icon="audible"]');
    if (!video || !actions || !playback || !sound || !playIcon || !pauseIcon || !mutedIcon || !audibleIcon) return;
    const { playLabel, pauseLabel } = playback.dataset;
    const { muteLabel, unmuteLabel } = sound.dataset;
    if (!playLabel || !pauseLabel || !muteLabel || !unmuteLabel) return;

    this.events = new AbortController();
    const { signal } = this.events;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const threshold = Number(this.dataset.shortVideoSeconds ?? 30);
    const shortVideoSeconds = Number.isFinite(threshold) && threshold >= 0 ? threshold : 30;
    let short = false;
    let visible = false;
    let manuallyPaused = false;
    let manuallyStarted = false;
    let pendingPlay = false;
    let automaticPause = false;
    let automaticPlay = false;

    const updateControls = () => {
      const audio = detectVideoAudio(video);
      // Native controls also retain caption selection for authored text tracks.
      const enhanced = short && audio !== 'unknown' && !video.querySelector('track');
      video.controls = !enhanced;
      actions.hidden = !enhanced;
      sound.hidden = audio !== 'present';
      this.dataset.audio = audio;
    };

    const updateButtons = () => {
      updateControls();
      const paused = video.paused;
      this.toggleAttribute('data-paused', paused);
      playback.setAttribute('aria-label', paused ? playLabel : pauseLabel);
      playback.title = paused ? playLabel : pauseLabel;
      playIcon.setAttribute('data-pf-video-hidden', String(!paused));
      pauseIcon.setAttribute('data-pf-video-hidden', String(paused));
      sound.setAttribute('aria-label', video.muted ? unmuteLabel : muteLabel);
      sound.title = video.muted ? unmuteLabel : muteLabel;
      mutedIcon.setAttribute('data-pf-video-hidden', String(!video.muted));
      audibleIcon.setAttribute('data-pf-video-hidden', String(video.muted));
    };

    const pauseAutomatically = () => {
      if (!video.paused) {
        automaticPause = true;
        video.pause();
      }
    };

    const canPlay = () => visible && !document.hidden && !manuallyPaused && (!motion.matches || manuallyStarted);
    const play = (automatic: boolean) => {
      if (pendingPlay || !video.paused) return;
      pendingPlay = true;
      automaticPlay = automatic;
      void video.play().then(() => {
        // A play promise can settle after navigation or a visibility change.
        if (signal.aborted) {
          if (!this.events) video.pause();
          return;
        }
        if (short && !canPlay()) pauseAutomatically();
      }).catch(() => {
        // Rejected autoplay leaves a visible, keyboard-operable play control.
        if (!signal.aborted) updateButtons();
      }).finally(() => {
        pendingPlay = false;
        automaticPlay = false;
        if (!signal.aborted) updateButtons();
      });
    };

    const updatePlayback = () => {
      // Only looping clips are paused/resumed by visibility and motion changes.
      video.autoplay = false;
      if (!short) return;
      if (canPlay()) play(true);
      else {
        pauseAutomatically();
        if (!visible || document.hidden) video.muted = true;
      }
      updateButtons();
    };

    const setDuration = (seconds: number) => {
      const nextShort = Number.isFinite(seconds) && seconds > 0 && seconds <= shortVideoSeconds;
      if (short !== nextShort) {
        pauseAutomatically();
        video.muted = nextShort || video.defaultMuted;
      }
      short = nextShort;
      this.dataset.mode = short ? 'loop' : 'player';
      video.loop = short;
      updatePlayback();
      updateButtons();
    };

    for (const event of ['loadedmetadata', 'durationchange']) {
      video.addEventListener(event, () => setDuration(video.duration), { signal });
    }
    for (const event of ['loadeddata', 'playing', 'volumechange']) {
      video.addEventListener(event, updateButtons, { signal });
    }
    video.addEventListener('play', () => {
      if (!automaticPlay) {
        manuallyStarted = true;
        manuallyPaused = false;
      }
      updateButtons();
    }, { signal });
    video.addEventListener('pause', () => {
      if (!automaticPause) manuallyPaused = true;
      automaticPause = false;
      updateButtons();
    }, { signal });
    video.addEventListener('timeupdate', updateControls, { signal });
    video.addEventListener('emptied', () => {
      manuallyPaused = false;
      manuallyStarted = false;
      setDuration(Number.NaN);
    }, { signal });
    for (const event of ['addtrack', 'removetrack', 'change']) {
      video.audioTracks?.addEventListener(event, updateControls, { signal });
    }
    playback.addEventListener('click', () => {
      if (video.paused) {
        manuallyPaused = false;
        manuallyStarted = true;
        play(false);
      } else {
        manuallyPaused = true;
        video.pause();
      }
    }, { signal });
    sound.addEventListener('click', () => {
      video.muted = !video.muted;
      updateButtons();
    }, { signal });
    document.addEventListener('visibilitychange', updatePlayback, { signal });
    motion.addEventListener('change', updatePlayback, { signal });
    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.15);
        updatePlayback();
      }, { threshold: [0, 0.15] });
      this.observer.observe(video);
    } else {
      // Without visibility observation, allow manual playback but not autoplay.
      visible = true;
      manuallyPaused = true;
    }
    const hint = Number(this.dataset.duration ?? video.dataset.duration);
    setDuration(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : hint);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.events?.abort();
    this.events = undefined;
    this.querySelector('video')?.pause();
  }
}

if (!customElements.get('pf-video-player')) {
  customElements.define('pf-video-player', VideoPlayerElement);
}
