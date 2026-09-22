import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import PopupApp from './PopupApp.jsx';

const target = typeof document !== 'undefined' ? document.getElementById('popup-root') : null;
if (target) {
  const root = createRoot(target);
  flushSync(() => root.render(<PopupApp />));
  console.log('[popup-entry] mounted PopupApp');
}
