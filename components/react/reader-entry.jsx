import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ReaderApp from './ReaderApp.jsx';

const target = typeof document !== 'undefined' ? document.getElementById('reader-root') : null;
if (target) {
  const root = createRoot(target);
  flushSync(() => root.render(<ReaderApp />));
}
