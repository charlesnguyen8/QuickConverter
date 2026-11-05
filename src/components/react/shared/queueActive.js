function lanesOf(state) {
  if (!state) return [];
  if (Array.isArray(state.lanes) && state.lanes.length > 0) return state.lanes;
  return [state];
}

export function activeTaskIds(state) {
  return lanesOf(state).map((lane) => lane.activeTask && lane.activeTask.id).filter(Boolean);
}

export function chapterFinished(prevIds, nextIds) {
  const next = new Set(nextIds || []);
  return (prevIds || []).some((id) => !next.has(id));
}

export function queueStatusIndex(state, novelId) {
  const map = new Map();
  for (const lane of lanesOf(state)) {
    const at = lane.activeTask;
    if (at && at.novelId === novelId) map.set(Number(at.chapterNumber), { status: 'processing' });
    (lane.queue || []).filter((t) => t.novelId === novelId).forEach((t, i) => {
      const retry = t.status === 'retry_pending';
      map.set(Number(t.chapterNumber), {
        status: retry ? 'retry_pending' : 'queued',
        queuePosition: i + 1,
        retryCount: t.retryCount || 1
      });
    });
  }
  return map;
}
