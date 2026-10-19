export async function releaseScreenOn(win = typeof window !== 'undefined' ? window : null) {
  const screen = win && win.Platform && win.Platform.screen;
  if (!screen || typeof screen.keepAwake !== 'function') return;
  try {
    await screen.keepAwake(false);
  } catch (e) {}
}
