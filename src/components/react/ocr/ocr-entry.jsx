import React from 'react';
import { createRoot } from 'react-dom/client';
import OcrPanelApp from './OcrPanelApp.jsx';

const target = typeof document !== 'undefined' ? document.getElementById('ocr-root') : null;
if (target) {
  createRoot(target).render(<OcrPanelApp />);
}
