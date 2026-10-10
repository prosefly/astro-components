export interface VideoPlayerLabels {
  play: string;
  pause: string;
  mute: string;
  unmute: string;
  download: string;
}

export interface VideoPlayerOptions {
  /** Maximum duration in seconds for automatic looping. Zero disables looping. */
  shortVideoSeconds?: number;
  labels?: Partial<VideoPlayerLabels>;
}

export function resolveVideoPlayerOptions(options: VideoPlayerOptions = {}) {
  const shortVideoSeconds = options.shortVideoSeconds ?? 30;
  if (!Number.isFinite(shortVideoSeconds) || shortVideoSeconds < 0) {
    throw new Error('shortVideoSeconds must be a finite, non-negative number.');
  }

  return {
    shortVideoSeconds,
    labels: {
      play: options.labels?.play ?? 'Play',
      pause: options.labels?.pause ?? 'Pause',
      mute: options.labels?.mute ?? 'Mute',
      unmute: options.labels?.unmute ?? 'Unmute',
      download: options.labels?.download ?? 'Download video',
    },
  };
}
