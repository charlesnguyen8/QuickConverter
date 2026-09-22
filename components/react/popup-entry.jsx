import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import PopupShell from './PopupShell.jsx';

const target = typeof document !== 'undefined' ? document.getElementById('popup-root') : null;
if (target) {
  const root = createRoot(target);
  flushSync(() => root.render(<PopupShell />));
}
