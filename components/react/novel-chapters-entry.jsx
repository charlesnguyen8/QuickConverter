import React from 'react';
import { createRoot } from 'react-dom/client';
import NovelChapters from './NovelChapters.jsx';

function mount() {
  const target = document.getElementById('novel-chapters-root');
  if (target) createRoot(target).render(<NovelChapters />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
