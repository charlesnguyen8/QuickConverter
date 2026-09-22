import React from 'react';
import { createRoot } from 'react-dom/client';
import NovelHero from './NovelHero.jsx';

function mount() {
  const target = document.getElementById('novel-hero-root');
  if (target) createRoot(target).render(<NovelHero />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
