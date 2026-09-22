import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import SettingsView from './SettingsView.jsx';

const target = typeof document !== 'undefined' ? document.getElementById('settings-root') : null;
if (target) {
  const root = createRoot(target);
  flushSync(() => root.render(<SettingsView />));
}
