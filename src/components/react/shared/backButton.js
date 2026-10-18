function defaultEnv() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  return {
    document: g.document,
    history: g.history,
    location: g.location,
    KeyboardEvent: g.KeyboardEvent
  };
}

function escapeEvent(KeyboardEventCtor) {
  if (typeof KeyboardEventCtor === 'function') {
    return new KeyboardEventCtor('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
  }
  return {
    type: 'keydown',
    key: 'Escape',
    code: 'Escape',
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }
  };
}

function isLibraryPage(location) {
  const path = (location && location.pathname) || '';
  return /(^|\/)(library|index)\.html$/.test(path) || /\/$/.test(path) || path === '';
}

export function handleBackPress({ canGoBack = false } = {}, env = defaultEnv()) {
  const doc = env.document;
  if (doc) {
    const active = doc.activeElement;
    const target = active && active !== doc.body && typeof active.dispatchEvent === 'function' ? active : doc;
    const event = escapeEvent(env.KeyboardEvent);
    const notCancelled = target.dispatchEvent(event);
    if (notCancelled === false || event.defaultPrevented) return 'closed';
  }
  if (canGoBack && env.history) {
    env.history.back();
    return 'back';
  }
  if (!isLibraryPage(env.location)) {
    env.location.href = 'library.html';
    return 'home';
  }
  if (typeof env.minimizeApp === 'function') env.minimizeApp();
  return 'exit';
}

export function installBackButton(platform = typeof globalThis !== 'undefined' ? globalThis.Platform : null, env = defaultEnv()) {
  const runtime = platform && platform.runtime;
  if (!runtime || typeof runtime.onBackButton !== 'function') return () => {};
  const withExit = {
    ...env,
    minimizeApp: env.minimizeApp || (() => { if (typeof runtime.minimizeApp === 'function') runtime.minimizeApp(); })
  };
  return runtime.onBackButton((info) => handleBackPress(info, withExit));
}
