import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import SettingsDeepSeekTab from './SettingsDeepSeekTab.jsx';

const target = typeof document !== 'undefined' ? document.getElementById('settings-deepseek-root') : null;
if (target) {
  const root = createRoot(target);
  flushSync(() => root.render(<SettingsDeepSeekTab />));
  console.log('[settings-deepseek-entry] mounted');
  window.dispatchEvent(new CustomEvent('settings-deepseek-mounted'));
}
