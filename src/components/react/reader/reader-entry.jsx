import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ReaderApp from './ReaderApp.jsx';
import { installBackButton } from '../shared/backButton.js';
import { refreshOnSync } from '../shared/SyncStatus.jsx';
import { installAppOcr } from '../shared/appOcr.js';

const target = typeof document !== 'undefined' ? document.getElementById('reader-root') : null;
if (target) {
  const root = createRoot(target);
  flushSync(() => root.render(<ReaderApp />));
}

installBackButton();
refreshOnSync(window, 'reader-chapter-refresh');
installAppOcr();
