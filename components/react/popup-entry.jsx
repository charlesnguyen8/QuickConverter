import React from 'react';
import { createRoot } from 'react-dom/client';
import PopupShell from './PopupShell.jsx';

const target = typeof document !== 'undefined' ? document.getElementById('popup-root') : null;
if (target) {
  createRoot(target).render(<PopupShell />);
}
