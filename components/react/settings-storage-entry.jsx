import React from 'react';
import { createRoot } from 'react-dom/client';
import SettingsStorageTab from './SettingsStorageTab.jsx';

function mount() {
  const target = document.getElementById('settings-storage-root');
  if (target) createRoot(target).render(<SettingsStorageTab />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
