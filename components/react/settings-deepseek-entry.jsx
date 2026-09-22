import React from 'react';
import { createRoot } from 'react-dom/client';
import SettingsDeepSeekTab from './SettingsDeepSeekTab.jsx';

function mount() {
  const target = document.getElementById('settings-deepseek-root');
  if (target) createRoot(target).render(<SettingsDeepSeekTab />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
