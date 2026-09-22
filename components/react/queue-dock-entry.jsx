import React from 'react';
import { createRoot } from 'react-dom/client';
import QueueDock from './QueueDock.jsx';

export function renderProgressRing(percent, size = 32, strokeWidth = 3, showText = true) {
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return `
    <div class="relative flex items-center justify-center flex-shrink-0" style="width: ${size}px; height: ${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="-rotate-90">
        <circle
          cx="${size / 2}"
          cy="${size / 2}"
          r="${radius}"
          fill="none"
          stroke="#334155"
          stroke-width="${strokeWidth}"
        />
        <circle
          cx="${size / 2}"
          cy="${size / 2}"
          r="${radius}"
          fill="none"
          stroke="#6366f1"
          stroke-width="${strokeWidth}"
          stroke-linecap="round"
          stroke-dasharray="${circumference.toFixed(1)}"
          stroke-dashoffset="${offset.toFixed(1)}"
          style="transition: stroke-dashoffset 0.8s ease;"
        />
      </svg>
      ${showText ? `<span class="absolute text-[9px] font-mono font-bold text-indigo-200 select-none">${pct}%</span>` : ''}
    </div>
  `;
}

export function mountQueueDock(container) {
  const target = typeof container === 'string' ? document.getElementById(container) : container;
  if (!target) return null;
  const root = createRoot(target);
  root.render(<QueueDock />);
  return root;
}

function autoMount() {
  if (typeof document === 'undefined') return;
  let target = document.getElementById('quickconverter-queue-dock-root');
  if (!target) {
    target = document.createElement('div');
    target.id = 'quickconverter-queue-dock-root';
    document.body.appendChild(target);
  }
  mountQueueDock(target);
}

if (typeof window !== 'undefined') {
  window.renderProgressRing = renderProgressRing;
  window.QueueDockReact = { mountQueueDock };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
}
