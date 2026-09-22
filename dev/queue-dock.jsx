import React from 'react';
import { createRoot } from 'react-dom/client';
import QueueDock from '../components/react/shared/QueueDock.jsx';

const listeners = new Set();
let state = { activeTask: null, queue: [], isPaused: false, cooldown: null };

function emit(next) {
  state = next;
  listeners.forEach((fn) => fn(state));
}

const fakeService = {
  getState: () => state,
  subscribe(fn) {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  },
  pause: () => emit({ ...state, isPaused: true }),
  resume: () => emit({ ...state, isPaused: false }),
  clearAll: () => emit({ activeTask: null, queue: [], isPaused: false, cooldown: null }),
  remove: (id) => emit({ ...state, activeTask: state.activeTask?.id === id ? null : state.activeTask, queue: state.queue.filter((t) => t.id !== id) }),
  skipCooldown: () => emit({ ...state, cooldown: null }),
  retryNow: () => emit({ ...state, cooldown: null }),
  skipFailedChapter: () => emit({ ...state, cooldown: null })
};

const task = (chapterNumber, title) => ({
  id: `task-${chapterNumber}`,
  chapterNumber,
  chapterTitle: title || `Chapter ${chapterNumber}: The Gate`,
  novelTitle: 'A Regressor’s Tale of Cultivation',
  options: { translation: { model: 'deepseek-flash' } },
  progress: { percent: 42, text: 'Translating (42%)...', phase: 'translating' }
});

const scenarios = {
  'Active + 3 queued': () => emit({
    activeTask: task(12),
    queue: [task(13), task(14), task(15)],
    isPaused: false,
    cooldown: null
  }),
  Empty: () => emit({ activeTask: null, queue: [], isPaused: false, cooldown: null }),
  'Cooldown 3m': () => emit({
    activeTask: null,
    queue: [task(13), task(14)],
    isPaused: false,
    cooldown: { active: true, type: 'wait', secondsRemaining: 180, totalSeconds: 300, nextChapterNumber: 13 }
  }),
  'Retry backoff': () => emit({
    activeTask: null,
    queue: [task(13)],
    isPaused: false,
    cooldown: { active: true, type: 'retry', secondsRemaining: 4400, totalSeconds: 4500, nextChapterNumber: 13, retryCount: 2, maxRetries: 3, error: '429 Too Many Requests' }
  }),
  Paused: () => emit({
    activeTask: task(12),
    queue: [task(13)],
    isPaused: true,
    cooldown: null
  })
};

const controls = document.getElementById('controls');
Object.keys(scenarios).forEach((label) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer';
  btn.onclick = () => scenarios[label]();
  controls.appendChild(btn);
});

createRoot(document.getElementById('queue-dock-root')).render(<QueueDock queueService={fakeService} />);
scenarios['Active + 3 queued']();
