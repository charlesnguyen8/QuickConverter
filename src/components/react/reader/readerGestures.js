const MIN_DISTANCE = 70;
const MAX_DURATION_MS = 800;

export function swipeDirection(start, end) {
  if (!start || !end) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < MIN_DISTANCE) return null;
  if (Math.abs(dx) < 2 * Math.abs(dy)) return null;
  if (end.t - start.t > MAX_DURATION_MS) return null;
  return dx < 0 ? 'next' : 'prev';
}

function defaultSelectionText() {
  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return '';
  const selection = window.getSelection();
  return selection ? String(selection) : '';
}

export function installSwipe(target, { onSwipe, isBlocked = () => false, selectionText = defaultSelectionText, now = () => Date.now() }) {
  if (!target || typeof target.addEventListener !== 'function') return () => {};
  let start = null;
  const onStart = (e) => {
    start = null;
    if (!e.touches || e.touches.length !== 1 || isBlocked(e.target)) return;
    const touch = e.touches[0];
    start = { x: touch.clientX, y: touch.clientY, t: now() };
  };
  const onEnd = (e) => {
    const from = start;
    start = null;
    if (!from || !e.changedTouches || e.changedTouches.length === 0) return;
    if (selectionText().trim() || isBlocked(e.target)) return;
    const touch = e.changedTouches[0];
    const direction = swipeDirection(from, { x: touch.clientX, y: touch.clientY, t: now() });
    if (direction) onSwipe(direction);
  };
  target.addEventListener('touchstart', onStart, { passive: true });
  target.addEventListener('touchend', onEnd, { passive: true });
  return () => {
    target.removeEventListener('touchstart', onStart);
    target.removeEventListener('touchend', onEnd);
  };
}
