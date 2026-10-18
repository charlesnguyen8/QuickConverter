export const DEFAULT_COVER = '../icons/default-cover.png';

const LEGACY_PLACEHOLDERS = ['https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp'];

export function coverSrc(thumbnail) {
  const value = typeof thumbnail === 'string' ? thumbnail.trim() : '';
  if (!value || LEGACY_PLACEHOLDERS.includes(value)) return DEFAULT_COVER;
  return value;
}

export function showDefaultCover(event) {
  const img = event && event.currentTarget;
  if (!img) return;
  const current = typeof img.getAttribute === 'function' ? img.getAttribute('src') : img.src;
  if (current === DEFAULT_COVER) return;
  img.src = DEFAULT_COVER;
}
