import React from 'react';
import { createRoot } from 'react-dom/client';
import LibraryView from './LibraryView.jsx';

function mount() {
  const target = document.getElementById('library-root');
  if (target) createRoot(target).render(<LibraryView />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
