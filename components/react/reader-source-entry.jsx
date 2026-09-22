import React from 'react';
import { createRoot } from 'react-dom/client';
import ReaderSourceDrawer from './ReaderSourceDrawer.jsx';

function mount() {
  const target = document.getElementById('reader-source-root');
  if (target) createRoot(target).render(<ReaderSourceDrawer />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
