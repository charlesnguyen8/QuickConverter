import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ReaderHeader from './ReaderHeader.jsx';

const target = typeof document !== 'undefined' ? document.getElementById('reader-header-root') : null;
if (target) {
  const root = createRoot(target);
  flushSync(() => root.render(<ReaderHeader />));
}
