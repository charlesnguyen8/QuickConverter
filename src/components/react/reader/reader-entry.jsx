import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ReaderApp from './ReaderApp.jsx';
import { installBackButton } from '../shared/backButton.js';
import SiteSaveStatus from '../shared/SiteSaveStatus.jsx';
import { installAppOcr } from '../shared/appOcr.js';

const target = typeof document !== 'undefined' ? document.getElementById('reader-root') : null;
if (target) {
  const root = createRoot(target);
  flushSync(() => root.render(<ReaderApp />));
}

installBackButton();
installAppOcr();

if (typeof document !== 'undefined' && document.body) {
  const statusHost = document.createElement('div');
  document.body.appendChild(statusHost);
  createRoot(statusHost).render(<SiteSaveStatus />);
}
