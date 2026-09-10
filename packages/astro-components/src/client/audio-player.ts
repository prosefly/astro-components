const prosefly = (window.__prosefly ??= {});
const playbackRates = [0.5, 1, 1.25, 1.5, 2];

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "00:00";
  }

  const seconds = Math.floor(value % 60);
  const minutes = Math.floor(value / 60) % 60;
  const hours = Math.floor(value / 3600);

  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatPlaybackRate(rate: number): string {
  return Number.isInteger(rate) ? `${rate.toFixed(1)}x` : `${rate}x`;
}

function seekBy(audio: HTMLAudioElement, offset: number): void {
  const target = Math.max(audio.currentTime + offset, 0);

  audio.currentTime = Number.isFinite(audio.duration)
    ? Math.min(target, audio.duration)
    : target;
}

function setMediaSession(player: HTMLElement, audio: HTMLAudioElement): void {
  if (!("mediaSession" in navigator) || typeof MediaMetadata !== "function") {
    return;
  }

  const artwork = player.dataset.pfAudioArtwork;

  navigator.mediaSession.metadata = new MediaMetadata({
    album: player.dataset.pfAudioAlbum,
    artist: player.dataset.pfAudioArtist,
    artwork: artwork ? [{ src: artwork }] : undefined,
    title: player.dataset.pfAudioTitle,
  });

  const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
    ["play", () => void audio.play().catch(() => undefined)],
    ["pause", () => audio.pause()],
    ["seekbackward", (details) => seekBy(audio, -(details.seekOffset ?? 15))],
    ["seekforward", (details) => seekBy(audio, details.seekOffset ?? 30)],
  ];

  actions.forEach(([action, handler]) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Some browsers expose Media Session without supporting every action.
    }
  });
}

function initMarquees(player: HTMLElement): void {
  player.querySelectorAll("[data-pf-audio-marquee]").forEach((marquee) => {
    const content = marquee.querySelector("[data-pf-audio-marquee-content]");

    if (
      !(marquee instanceof HTMLElement) ||
      !(content instanceof HTMLElement)
    ) {
      return;
    }

    const measure = () => {
      const isOverflowing = content.scrollWidth > marquee.clientWidth;

      marquee.dataset.pfAudioMarqueeActive = isOverflowing ? "true" : "false";
      marquee.style.setProperty(
        "--pf-audio-player-marquee-distance",
        `${content.scrollWidth}px`,
      );
      marquee.style.setProperty(
        "--pf-audio-player-marquee-duration",
        `${Math.max(content.scrollWidth / 50, 2).toFixed(2)}s`,
      );
    };

    measure();
    new ResizeObserver(measure).observe(marquee);
  });
}

function initAudioPlayer(player: HTMLElement): void {
  if (player.dataset.pfAudioPlayerReady) {
    return;
  }

  const audioNode = player.querySelector("audio");
  const playButtonNode = player.querySelector("[data-pf-audio-play]");
  const muteButtonNode = player.querySelector("[data-pf-audio-mute]");
  const seekNode = player.querySelector("[data-pf-audio-seek]");
  const currentTimeNode = player.querySelector("[data-pf-audio-current-time]");
  const durationNode = player.querySelector("[data-pf-audio-duration]");
  const rateButton = player.querySelector<HTMLButtonElement>(
    "[data-pf-audio-rate]",
  );
  const seekButtons = player.querySelectorAll<HTMLButtonElement>(
    "[data-pf-audio-seek-by]",
  );
  if (
    !(audioNode instanceof HTMLAudioElement) ||
    !(playButtonNode instanceof HTMLButtonElement) ||
    !(muteButtonNode instanceof HTMLButtonElement) ||
    !(seekNode instanceof HTMLInputElement) ||
    !(currentTimeNode instanceof HTMLElement) ||
    !(durationNode instanceof HTMLElement)
  ) {
    return;
  }

  const audio = audioNode;
  const playButton = playButtonNode;
  const muteButton = muteButtonNode;
  const seek = seekNode;
  const currentTime = currentTimeNode;
  const duration = durationNode;
  const initialDuration = player.dataset.pfAudioDuration || "--:--";
  let progressFrame: number | undefined;
  let isScrubbing = false;

  function setProgress(progress: number): void {
    seek.value = String(progress);
    seek.style.setProperty("--pf-audio-player-progress", `${progress}%`);
  }

  function updateProgress(): void {
    if (isScrubbing) {
      return;
    }

    const hasDuration = Number.isFinite(audio.duration) && audio.duration > 0;
    const progress = hasDuration
      ? (audio.currentTime / audio.duration) * 100
      : 0;

    setProgress(progress);
    seek.disabled = !hasDuration;
  }

  function syncProgress(): void {
    updateProgress();

    if (!audio.paused && !audio.ended && audio.isConnected) {
      progressFrame = requestAnimationFrame(syncProgress);
    } else {
      progressFrame = undefined;
    }
  }

  function startProgressSync(): void {
    if (!isScrubbing && progressFrame === undefined) {
      syncProgress();
    }
  }

  function cancelProgressSync(): void {
    if (progressFrame !== undefined) {
      cancelAnimationFrame(progressFrame);
      progressFrame = undefined;
    }
  }

  function stopProgressSync(): void {
    cancelProgressSync();

    updateProgress();
  }

  function beginScrubbing(): void {
    isScrubbing = true;
    cancelProgressSync();
  }

  function previewSeek(): void {
    const hasDuration = Number.isFinite(audio.duration) && audio.duration > 0;

    if (!hasDuration) {
      return;
    }

    const progress = Number(seek.value);
    const targetTime = (progress / 100) * audio.duration;

    setProgress(progress);
    currentTime.textContent = formatTime(targetTime);
    seek.ariaValueText = `${formatTime(targetTime)} of ${formatTime(audio.duration)}`;
    audio.currentTime = targetTime;
  }

  function endScrubbing(): void {
    if (!isScrubbing) {
      return;
    }

    isScrubbing = false;
    updateTime();

    if (!audio.paused && !audio.ended) {
      startProgressSync();
    }
  }

  function updatePlayback(): void {
    const isPlaying = !audio.paused && !audio.ended;

    player.dataset.pfAudioPlaying = isPlaying ? "true" : "false";
    playButton.ariaLabel = isPlaying ? "Pause" : "Play";

    if (isPlaying) {
      startProgressSync();
    } else {
      stopProgressSync();
    }
  }

  function updateMuted(): void {
    const isMuted = audio.muted || audio.volume === 0;

    player.dataset.pfAudioMuted = isMuted ? "true" : "false";
    muteButton.ariaLabel = isMuted ? "Unmute" : "Mute";
  }

  function updatePlaybackRate(): void {
    if (!(rateButton instanceof HTMLButtonElement)) {
      return;
    }

    const label = formatPlaybackRate(audio.playbackRate);

    rateButton.textContent = label;
    rateButton.ariaLabel = `Change playback speed, current ${label}`;
  }

  function updateTime(): void {
    const hasDuration = Number.isFinite(audio.duration) && audio.duration > 0;

    updateProgress();
    currentTime.textContent = formatTime(audio.currentTime);
    duration.textContent = hasDuration
      ? formatTime(audio.duration)
      : initialDuration;
    seek.ariaValueText = hasDuration
      ? `${formatTime(audio.currentTime)} of ${formatTime(audio.duration)}`
      : null;
  }

  playButton.addEventListener("click", () => {
    if (audio.paused || audio.ended) {
      void audio.play().catch(updatePlayback);
    } else {
      audio.pause();
    }
  });

  muteButton.addEventListener("click", () => {
    if (audio.muted) {
      audio.muted = false;
    } else if (audio.volume === 0) {
      audio.volume = 1;
    } else {
      audio.muted = true;
    }
  });

  seek.addEventListener("pointerdown", beginScrubbing);
  seek.addEventListener("input", () => {
    beginScrubbing();
    previewSeek();
  });
  seek.addEventListener("change", () => {
    previewSeek();
    endScrubbing();
  });
  seek.addEventListener("pointerup", endScrubbing);
  seek.addEventListener("pointercancel", endScrubbing);
  seek.addEventListener("blur", endScrubbing);

  seekButtons.forEach((button) => {
    button.addEventListener("click", () => {
      seekBy(audio, Number(button.dataset.pfAudioSeekBy) || 0);
      updateTime();
    });
  });

  if (rateButton instanceof HTMLButtonElement) {
    rateButton.addEventListener("click", () => {
      const index = playbackRates.indexOf(audio.playbackRate);
      const nextIndex =
        index < 0 || index === playbackRates.length - 1 ? 0 : index + 1;

      audio.playbackRate = playbackRates[nextIndex];
    });
  }

  audio.addEventListener("play", () => {
    updatePlayback();
    setMediaSession(player, audio);
  });
  audio.addEventListener("pause", () => {
    updatePlayback();
    updateTime();
  });
  audio.addEventListener("ended", () => {
    updatePlayback();
    updateTime();
  });
  audio.addEventListener("volumechange", updateMuted);
  audio.addEventListener("loadedmetadata", updateTime);
  audio.addEventListener("durationchange", updateTime);
  audio.addEventListener("timeupdate", updateTime);
  audio.addEventListener("ratechange", updatePlaybackRate);

  audio.controls = false;
  player.dataset.pfAudioPlayerReady = "true";
  initMarquees(player);
  updatePlayback();
  updatePlaybackRate();
  updateMuted();
  updateTime();
}

function initAudioPlayers(): void {
  document.querySelectorAll(".pf-audio-player").forEach((player) => {
    if (player instanceof HTMLElement) {
      initAudioPlayer(player);
    }
  });
}

if (!prosefly.initAudioPlayers) {
  prosefly.initAudioPlayers = initAudioPlayers;
  document.addEventListener("astro:page-load", prosefly.initAudioPlayers);
}

prosefly.initAudioPlayers();

export {};
