import React, { useCallback, useRef, useState } from 'react';

function laneNovel(lane) {
  const task = lane.activeTask || (lane.queue && lane.queue[0]) || null;
  return task ? { novelId: task.novelId, novelTitle: task.novelTitle || 'Novel' } : null;
}

function laneBusy(lane) {
  return !!(lane.activeTask || (lane.queue && lane.queue.length) || (lane.cooldown && lane.cooldown.active) || lane.isPaused);
}

export function busyLanesFor(state, novelId) {
  const lanes = state && Array.isArray(state.lanes) ? state.lanes : [];
  const busy = lanes.filter(laneBusy).map((lane) => ({ lane, novel: laneNovel(lane) })).filter((l) => l.novel);
  if (busy.some((l) => l.novel.novelId === novelId)) return [];
  return busy.map(({ lane, novel }) => ({
    id: lane.id,
    novelTitle: novel.novelTitle,
    count: (lane.activeTask ? 1 : 0) + (lane.queue ? lane.queue.length : 0)
  }));
}

export function askForLane(service, novel, ask) {
  const state = service && typeof service.getState === 'function' ? service.getState() : null;
  const lanes = busyLanesFor(state, novel && novel.id);
  if (lanes.length === 0) return Promise.resolve('auto');
  return Promise.resolve(ask({ novelTitle: novel && novel.title, lanes }));
}

export default function ChooseQueueDialog({ novelTitle, lanes, onChoose, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" id="choose-queue-dialog">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-4 flex flex-col gap-3 text-slate-100">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold">Another download is running</span>
          <span className="text-xs text-slate-400">Where should the chapters of <strong className="text-slate-200">{novelTitle || 'this novel'}</strong> go?</span>
        </div>
        <div className="flex flex-col gap-2">
          {(lanes || []).map((lane) => (
            <button
              key={lane.id}
              type="button"
              data-queue-choice={lane.id}
              onClick={() => onChoose(lane.id)}
              className="min-h-10 px-3 py-2 rounded-xl text-left text-xs font-semibold bg-slate-800 border border-slate-700 hover:border-indigo-500 hover:bg-slate-700 transition cursor-pointer"
            >
              <span className="block">Add to the current queue</span>
              <span className="block text-[11px] font-medium text-slate-400 truncate">{lane.novelTitle} · {lane.count} {lane.count === 1 ? 'chapter' : 'chapters'}</span>
            </button>
          ))}
          <button
            type="button"
            data-queue-choice="new"
            onClick={() => onChoose('new')}
            className="min-h-10 px-3 py-2 rounded-xl text-left text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition cursor-pointer"
          >
            <span className="block">Start a new queue</span>
            <span className="block text-[11px] font-medium text-indigo-200">Runs alongside the others</span>
          </button>
        </div>
        <button
          type="button"
          id="choose-queue-cancel"
          onClick={onCancel}
          className="self-end min-h-10 px-3 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function useQueueChooser() {
  const [ask, setAsk] = useState(null);
  const pending = useRef(null);

  const settle = useCallback((choice) => {
    const resolve = pending.current;
    pending.current = null;
    setAsk(null);
    if (resolve) resolve(choice);
  }, []);

  const chooseLane = useCallback((service, novel) => askForLane(service, novel, (question) => {
    if (pending.current) pending.current(null);
    return new Promise((resolve) => {
      pending.current = resolve;
      setAsk(question);
    });
  }), []);

  const dialog = ask ? (
    <ChooseQueueDialog novelTitle={ask.novelTitle} lanes={ask.lanes} onChoose={settle} onCancel={() => settle(null)} />
  ) : null;

  return { dialog, chooseLane };
}
