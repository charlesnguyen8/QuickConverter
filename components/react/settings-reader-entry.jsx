import React from 'react';
import { createRoot } from 'react-dom/client';
import SettingsReaderTab from './SettingsReaderTab.jsx';

function mount() {
  const target = document.getElementById('settings-reader-root');
  if (target) createRoot(target).render(<SettingsReaderTab />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
