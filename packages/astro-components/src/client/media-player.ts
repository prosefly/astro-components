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

function seekBy(media: HTMLMediaElement, offset: number): void {
  const target = Math.max(media.currentTime + offset, 0);

  media.currentTime = Number.isFinite(media.duration)
    ? Math.min(target, media.duration)
    : target;
}

function setMediaSession(player: HTMLElement, media: HTMLAudioElement): void {
  if (!("mediaSession" in navigator) || typeof MediaMetadata !== "function") {
    return;
  }

  const artwork = player.dataset.pfMediaArtwork;

  navigator.mediaSession.metadata = new MediaMetadata({
    album: player.dataset.pfMediaAlbum,
    artist: player.dataset.pfMediaArtist,
    artwork: artwork ? [{ src: artwork }] : undefined,
    title: player.dataset.pfMediaTitle,
  });

  const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
    ["play", () => void media.play().catch(() => undefined)],
    ["pause", () => media.pause()],
    ["seekbackward", (details) => seekBy(media, -(details.seekOffset ?? 15))],
    ["seekforward", (details) => seekBy(media, details.seekOffset ?? 30)],
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
  player.querySelectorAll("[data-pf-media-marquee]").forEach((marquee) => {
    const content = marquee.querySelector("[data-pf-media-marquee-content]");

    if (
      !(marquee instanceof HTMLElement) ||
      !(content instanceof HTMLElement)
    ) {
      return;
    }

    const measure = () => {
      const isOverflowing = content.scrollWidth > marquee.clientWidth;

      marquee.dataset.pfMediaMarqueeActive = isOverflowing ? "true" : "false";
      marquee.style.setProperty(
        "--pf-media-marquee-distance",
        `${content.scrollWidth}px`,
      );
      marquee.style.setProperty(
        "--pf-media-marquee-duration",
        `${Math.max(content.scrollWidth / 50, 2).toFixed(2)}s`,
      );
    };

    measure();
    new ResizeObserver(measure).observe(marquee);
  });
}

function initMediaPlayer(player: HTMLElement): void {
  if (player.dataset.pfMediaPlayerReady) {
    return;
  }

  const mediaNode = player.querySelector("audio, video");
  const playButtonNode = player.querySelector("[data-pf-media-play]");
  const muteButtonNode = player.querySelector("[data-pf-media-mute]");
  const seekNode = player.querySelector("[data-pf-media-seek]");
  const currentTimeNode = player.querySelector("[data-pf-media-current-time]");
  const durationNode = player.querySelector("[data-pf-media-duration]");
  const rateButton = player.querySelector<HTMLButtonElement>(
    "[data-pf-media-rate]",
  );
  const seekButtons = player.querySelectorAll<HTMLButtonElement>(
    "[data-pf-media-seek-by]",
  );
  const fullscreenButton = player.querySelector<HTMLButtonElement>(
    "[data-pf-media-fullscreen]",
  );

  if (
    !(mediaNode instanceof HTMLMediaElement) ||
    !(playButtonNode instanceof HTMLButtonElement) ||
    !(muteButtonNode instanceof HTMLButtonElement) ||
    !(seekNode instanceof HTMLInputElement) ||
    !(currentTimeNode instanceof HTMLElement) ||
    !(durationNode instanceof HTMLElement)
  ) {
    return;
  }

  const media = mediaNode;
  const playButton = playButtonNode;
  const muteButton = muteButtonNode;
  const seek = seekNode;
  const currentTime = currentTimeNode;
  const duration = durationNode;
  const initialDuration = player.dataset.pfMediaDuration || "--:--";
  let progressFrame: number | undefined;

  function updateProgress(): void {
    const hasDuration = Number.isFinite(media.duration) && media.duration > 0;
    const progress = hasDuration
      ? (media.currentTime / media.duration) * 100
      : 0;

    seek.value = String(progress);
    seek.style.setProperty("--pf-media-progress", `${progress}%`);
    seek.disabled = !hasDuration;
  }

  function syncProgress(): void {
    updateProgress();

    if (!media.paused && !media.ended && media.isConnected) {
      progressFrame = requestAnimationFrame(syncProgress);
    } else {
      progressFrame = undefined;
    }
  }

  function startProgressSync(): void {
    if (progressFrame === undefined) {
      syncProgress();
    }
  }

  function stopProgressSync(): void {
    if (progressFrame !== undefined) {
      cancelAnimationFrame(progressFrame);
      progressFrame = undefined;
    }

    updateProgress();
  }

  function updatePlayback(): void {
    const isPlaying = !media.paused && !media.ended;

    player.dataset.pfMediaPlaying = isPlaying ? "true" : "false";
    playButton.ariaLabel = isPlaying ? "Pause" : "Play";

    if (isPlaying) {
      startProgressSync();
    } else {
      stopProgressSync();
    }
  }

  function updateMuted(): void {
    const isMuted = media.muted || media.volume === 0;

    player.dataset.pfMediaMuted = isMuted ? "true" : "false";
    muteButton.ariaLabel = isMuted ? "Unmute" : "Mute";
  }

  function updatePlaybackRate(): void {
    if (!(rateButton instanceof HTMLButtonElement)) {
      return;
    }

    const label = formatPlaybackRate(media.playbackRate);

    rateButton.textContent = label;
    rateButton.ariaLabel = `Change playback speed, current ${label}`;
  }

  function updateTime(): void {
    const hasDuration = Number.isFinite(media.duration) && media.duration > 0;

    updateProgress();
    currentTime.textContent = formatTime(media.currentTime);
    duration.textContent = hasDuration
      ? formatTime(media.duration)
      : initialDuration;
    seek.ariaValueText = hasDuration
      ? `${formatTime(media.currentTime)} of ${formatTime(media.duration)}`
      : null;
  }

  playButton.addEventListener("click", () => {
    if (media.paused || media.ended) {
      void media.play().catch(updatePlayback);
    } else {
      media.pause();
    }
  });

  muteButton.addEventListener("click", () => {
    if (media.muted) {
      media.muted = false;
    } else if (media.volume === 0) {
      media.volume = 1;
    } else {
      media.muted = true;
    }
  });

  seek.addEventListener("input", () => {
    if (Number.isFinite(media.duration) && media.duration > 0) {
      media.currentTime = (Number(seek.value) / 100) * media.duration;
    }
  });

  seekButtons.forEach((button) => {
    button.addEventListener("click", () => {
      seekBy(media, Number(button.dataset.pfMediaSeekBy) || 0);
      updateTime();
    });
  });

  if (rateButton instanceof HTMLButtonElement) {
    rateButton.addEventListener("click", () => {
      const index = playbackRates.indexOf(media.playbackRate);
      const nextIndex =
        index < 0 || index === playbackRates.length - 1 ? 0 : index + 1;

      media.playbackRate = playbackRates[nextIndex];
    });
  }

  media.addEventListener("play", () => {
    updatePlayback();

    if (media instanceof HTMLAudioElement) {
      setMediaSession(player, media);
    }
  });
  media.addEventListener("pause", () => {
    updatePlayback();
    updateTime();
  });
  media.addEventListener("ended", () => {
    updatePlayback();
    updateTime();
  });
  media.addEventListener("volumechange", updateMuted);
  media.addEventListener("loadedmetadata", updateTime);
  media.addEventListener("durationchange", updateTime);
  media.addEventListener("timeupdate", updateTime);
  media.addEventListener("ratechange", updatePlaybackRate);

  if (media instanceof HTMLVideoElement) {
    media.addEventListener("click", () => {
      if (media.paused || media.ended) {
        void media.play().catch(updatePlayback);
      } else {
        media.pause();
      }
    });
  }

  if (fullscreenButton instanceof HTMLButtonElement) {
    if (typeof player.requestFullscreen !== "function") {
      fullscreenButton.hidden = true;
    }

    fullscreenButton.addEventListener("click", () => {
      const action =
        document.fullscreenElement === player
          ? document.exitFullscreen()
          : player.requestFullscreen();

      void action.catch(() => undefined);
    });

    player.addEventListener("fullscreenchange", () => {
      const isFullscreen = document.fullscreenElement === player;

      player.dataset.pfMediaFullscreen = isFullscreen ? "true" : "false";
      fullscreenButton.ariaLabel = isFullscreen
        ? "Exit fullscreen"
        : "Enter fullscreen";
    });
  }

  media.controls = false;
  player.dataset.pfMediaPlayerReady = "true";
  initMarquees(player);
  updatePlayback();
  updatePlaybackRate();
  updateMuted();
  updateTime();
}

function initMediaPlayers(): void {
  document.querySelectorAll("[data-pf-media-player]").forEach((player) => {
    if (player instanceof HTMLElement) {
      initMediaPlayer(player);
    }
  });
}

if (!prosefly.initMediaPlayers) {
  prosefly.initMediaPlayers = initMediaPlayers;
  document.addEventListener("astro:page-load", prosefly.initMediaPlayers);
}

prosefly.initMediaPlayers();

export {};
