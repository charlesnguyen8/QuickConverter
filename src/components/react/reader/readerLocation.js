import { useEffect, useState } from 'react';

export const READER_LOCATION_EVENT = 'reader-location-change';

function defaultWindow() {
  return typeof window !== 'undefined' ? window : null;
}

export function readerChapterHref(id, ch) {
  return `reader.html?id=${encodeURIComponent(id)}&ch=${encodeURIComponent(ch)}`;
}

function currentSearch(win) {
  return win && win.location ? win.location.search || '' : '';
}

export function navigateToChapter(id, ch, win = defaultWindow()) {
  if (!win) return;
  const href = readerChapterHref(id, ch);
  const history = win.history;
  if (!history || typeof history.pushState !== 'function') {
    win.location.href = href;
    return;
  }
  if (currentSearch(win) === href.slice(href.indexOf('?'))) return;
  history.pushState({ id, ch }, '', href);
  if (typeof win.scrollTo === 'function') win.scrollTo(0, 0);
  win.dispatchEvent(new Event(READER_LOCATION_EVENT));
}

export function subscribeReaderLocation(callback, win = defaultWindow()) {
  if (!win || typeof win.addEventListener !== 'function') return () => {};
  const onChange = () => callback(currentSearch(win));
  win.addEventListener(READER_LOCATION_EVENT, onChange);
  win.addEventListener('popstate', onChange);
  return () => {
    win.removeEventListener(READER_LOCATION_EVENT, onChange);
    win.removeEventListener('popstate', onChange);
  };
}

export function useReaderSearch() {
  const [search, setSearch] = useState(() => currentSearch(defaultWindow()));
  useEffect(() => subscribeReaderLocation(setSearch), []);
  return search;
}
