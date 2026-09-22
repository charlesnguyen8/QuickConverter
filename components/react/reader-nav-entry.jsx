import React from 'react';
import { createRoot } from 'react-dom/client';
import ReaderNav from './ReaderNav.jsx';

function mount() {
  const target = document.getElementById('reader-nav-root');
  if (target) createRoot(target).render(<ReaderNav />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
