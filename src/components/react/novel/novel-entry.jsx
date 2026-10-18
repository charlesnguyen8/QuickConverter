import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import NovelApp from './NovelApp.jsx';
import { installBackButton } from '../shared/backButton.js';

const target = typeof document !== 'undefined' ? document.getElementById('novel-root') : null;
if (target) {
  const root = createRoot(target);
  flushSync(() => root.render(<NovelApp />));
}

installBackButton();
