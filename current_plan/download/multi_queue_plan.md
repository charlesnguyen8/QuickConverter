# Several download queues in parallel

**Status (2026-10-23):** phases 1-3 built; phase 4 to do.

## Goal

Download one novel while reading it and another in the background. When a download starts for a
novel while a queue is busy with a different novel, ask: **add to the current queue** or **start a
new queue**. New queues run in parallel with the others.

## Owner decisions

- **One queue per novel**, any number of queues; each still downloads one chapter at a time.
- **Same site takes turns**: queues on the same site (e.g. two sangtacviet novels) alternate one
  chapter at a time, so the site sees one reader; different sites run truly in parallel.
- **Ask only when another novel is busy**: chapters of a novel that already has a queue always
  join it; the question appears only when a queue is running for a different novel.
- **Cooldown per queue**: the setting is shared, but each queue waits between its own chapters.

## Design

### 1. Queues ("lanes") inside one service

`DownloadQueueService` keeps its name and becomes a manager of lanes. A lane is today's queue:
its own waiting chapters, active chapter, pause/resume, cooldown, retry backoff, pause error and
skipped list. Lanes are created on demand and removed when they are empty and idle.

- Every task records its `laneId`; a novel belongs to at most one lane at a time.
- `enqueue` / `enqueueBatch` take `{ lane: 'auto' | 'new' | <laneId> }`. `auto` = the novel's
  lane if it has one, else the only lane, else a new lane.
- `getChapterStatus`, `isQueued`, `remove` look across lanes.
- `getState()` returns `{ lanes: [...], ...summary }`; the summary keeps today's top-level fields
  (activeTask of the first busy lane, total count, isProcessing) so nothing breaks before the UI
  moves to lanes.
- Pause, resume, clear, skip cooldown, retry now, skip failed chapter, dismiss skipped all take a
  `laneId`. "Clear all" clears every lane.

### 2. Same site takes turns

A per-site turn (keyed by provider id) wraps the page/fetch part of `downloadChapter`. A lane
waits for its site's turn before fetching a chapter and releases it as soon as the chapter's
source is in hand, before translation, so translation of one lane overlaps the next lane's
fetch. Waiting lanes are served first come, first served, which gives the alternation.
Different sites never wait for each other.

### 3. Cooldown and backoff per lane

Each lane runs its own cooldown and retry backoff with the shared settings. In the extension each
lane has its own alarm (`QUEUE_COOLDOWN_ALARM:<laneId>`).

### 4. Persistence and the worker

- The saved queue state becomes `{ lanes: [...] }`; an old single-queue save loads as one lane.
- The extension's `QUEUE_*` messages carry `laneId`; enqueue messages carry the lane choice.
  Pages still mirror the worker's state.

### 5. Asking which queue

A shared `ChooseQueueDialog` is shown by the novel page, the popup and the reader's chapter list
when a download starts for a novel with no lane while another novel's lane is busy:

- **Add to current queue (Novel Y)**: one button per busy lane, so the user can pick which.
- **Start a new queue**.

Chapters of a novel that already has a lane skip the question.

### 6. Dock

The dock lists the lanes, each with its novel, active chapter and progress, waiting count,
pause/resume, cooldown with Skip, retry backoff with Retry Now, and its skipped list. Collapsed:
"2 queues · 15 chapters". Mobile: lanes stack, touch targets stay 40 px.

### 7. App background

The foreground service stays on while any lane works; its text summarizes the lanes
("2 queues · Chapter 12 of Novel A, Chapter 3 of Novel B").

## Phases

1. **Lanes inside the service, one lane only.** Refactor the queue logic into a lane; the manager
   holds one lane; the API and every current test stay unchanged (characterization first).
   - **Built:** `QueueLane` (the old queue class) knows its `laneId` and stamps it on every task;
     `DownloadQueueManager` is `DownloadQueueService`, holds the lanes (`main` only), forwards the
     public methods and the few fields tests read, and adds `lanes: [{ id: 'main', ... }]` to
     `getState()` and to what subscribers receive. Persistence and worker messages are still per
     lane (main); they move to the manager in phase 2.
2. **Several lanes.** Lane choice on enqueue, lookups across lanes, per-lane controls and
   cooldowns, same-site turns, persistence with migration, worker messages with `laneId`. Tests
   for parallel lanes on different sites, alternation on the same site, per-lane cooldown, and
   restore.
   - **Built:** `enqueue`/`enqueueBatch` take `{ lane: 'auto' | 'new' | laneId }` (a novel always
     joins its own lane); controls (`pause`, `resume`, `skipCooldown`, `retryNow`, `clearAll`, ...)
     take an optional `laneId` and act on every lane without one. Each lane has its own cooldown
     alarm (`QUEUE_COOLDOWN_ALARM:<laneId>`). `siteTurn(site)` is a first-come lock held only
     around `fetchChapterSource`, so same-site lanes alternate and translation runs in parallel.
     The manager persists `lanes` (a legacy save loads as `main`), drops idle lanes, and answers
     every `QUEUE_*` worker message (`handleWorkerMessage`); pages mirror the worker's lanes.
     No UI yet, so nothing visible changes until phase 3.
3. **UI.** `ChooseQueueDialog` at the three places downloads start; the dock shows lanes; chapter
   rows keep their status across lanes.
   - **Built:** `shared/ChooseQueueDialog.jsx` (`busyLanesFor`, `askForLane`, `useQueueChooser`)
     asks in `NovelApp`, `PopupApp` and `ReaderChapterList` and passes `{ lane }` to the queue;
     Cancel queues nothing. With several lanes the dock header reads "N queues" with Pause all /
     Clear All, each lane gets a card (novel title, its own Pause/Resume and Clear, active chapter,
     cooldown, skipped, waiting list), and the collapsed pill reads "2 queues · 5 chapters". One
     lane keeps the old look.
4. **App background text and docs** (`context.md`, AGENTS.md, README).

Each phase ends with `npm test`, `build:ext`, `build:app` and a check in the extension and on the
phone.

## Open points

- **Reading while downloading**: a single chapter downloaded from the reader joins its novel's
  lane at the end. Should it jump to the front of that lane instead, so the chapter being read
  comes first?
- **OCR**: image chapters from two lanes share the one OCR worker and take turns; fine for now.
