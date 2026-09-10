export type Artwork = string | { src: string };
export type Duration = string | number;

export function formatDuration(duration?: Duration): string {
  if (typeof duration === 'string') {
    return duration;
  }

  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
    return '--:--';
  }

  const seconds = Math.floor(duration % 60);
  const minutes = Math.floor(duration / 60) % 60;
  const hours = Math.floor(duration / 3600);

  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function resolveArtwork(artwork?: Artwork): string | undefined {
  return typeof artwork === 'string' ? artwork : artwork?.src;
}
