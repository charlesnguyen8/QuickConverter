import React from 'react';
import { createRoot } from 'react-dom/client';
import ReaderChapter from './ReaderChapter.jsx';

function mount() {
  const target = document.getElementById('reader-content-root');
  if (target) createRoot(target).render(<ReaderChapter />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
