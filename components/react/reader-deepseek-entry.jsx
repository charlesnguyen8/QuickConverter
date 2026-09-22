import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ReaderDeepseekCard from './ReaderDeepseekCard.jsx';

const target = typeof document !== 'undefined' ? document.getElementById('reader-deepseek-root') : null;
if (target) {
  const root = createRoot(target);
  flushSync(() => root.render(<ReaderDeepseekCard />));
}
