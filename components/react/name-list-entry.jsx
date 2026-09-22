import React from 'react';
import { createRoot } from 'react-dom/client';
import NameListDrawer from './NameListDrawer.jsx';

function mount() {
  const target = document.getElementById('name-list-root');
  if (target) createRoot(target).render(<NameListDrawer />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
