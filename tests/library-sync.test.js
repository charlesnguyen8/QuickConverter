const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('\n--- Running Library Sync (merge) Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}

function makeEnv() {
  const stores = { novels: {}, chapters: {}, syncState: {} };
  const reads = { chapterGetAll: 0 };
  const request = (result) => {
    const req = { result, onsuccess: null, onerror: null };
    setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
    return req;
  };
  const store = (name) => ({
    getAll: () => {
      if (name === 'chapters') reads.chapterGetAll++;
      return request(Object.values(stores[name]).map((r) => ({ ...r })));
    },
    get: (id) => request(stores[name][id] ? { ...stores[name][id] } : null),
    put: (record) => { stores[name][record.id] = { ...record }; },
    delete: (id) => { delete stores[name][id]; },
    clear: () => { stores[name] = {}; },
    index: (field) => ({
      openCursor: (range) => {
        const matches = Object.values(stores[name]).filter((r) => r[field] === range.only);
        const req = { onsuccess: null };
        let i = 0;
        const step = () => setTimeout(() => {
          if (!req.onsuccess) return;
          const record = matches[i];
          req.onsuccess({
            target: {
              result: record
                ? { value: record, delete: () => { delete stores[name][record.id]; }, continue: () => { i++; step(); } }
                : null
            }
          });
        }, 0);
        step();
        return req;
      }
    })
  });
  const database = {
    transaction() {
      const tx = { objectStore: store, oncomplete: null, onerror: null };
      setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 20);
      return tx;
    }
  };
  const ls = { quickconverter_db_initialized: 'true' };
  const localStorage = {
    get length() { return Object.keys(ls).length; },
    key: (i) => Object.keys(ls)[i],
    getItem: (k) => (k in ls ? ls[k] : null),
    setItem: (k, v) => { ls[k] = String(v); },
    removeItem: (k) => { delete ls[k]; }
  };
  const env = {
    console: { log() {}, warn() {}, error() {} },
    URL,
    setTimeout,
    clearTimeout,
    localStorage,
    IDBKeyRange: { only: (value) => ({ only: value }) },
    indexedDB: { open: () => request(database) }
  };
  env.window = env;
  env.self = env;
  env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(read('src', 'services', 'platform.js'), env);
  vm.runInContext(read('src', 'services', 'storage.js'), env);
  return { S: env.StorageService, stores, ls, reads };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function library(parts = {}) {
  return {
    format: 'quickconverter-backup',
    version: 1,
    exportedAt: '2026-10-19T00:00:00.000Z',
    novels: [],
    chapters: [],
    preferences: {},
    deleted: { novels: {}, chapters: {} },
    ...parts
  };
}

const novel = (id, updatedAt, extra = {}) => ({
  id,
  title: `Book ${id}`,
  slug: id,
  createdAt: 1,
  updatedAt,
  nameList: [],
  glossaries: { locked: [], soft: [] },
  listsUpdatedAt: { namelist: 0, locked: 0, soft: 0 },
  ...extra
});
const chapter = (novelId, n, updatedAt, text = `text ${n}`) => ({ id: `${novelId}_ch${n}`, novelId, chapterNumber: n, title: `Chapter ${n}`, rawText: text, updatedAt });

let finished = false;
process.on('beforeExit', () => {
  if (!finished) {
    console.error('Library Sync suite stopped before its last test (a promise never settled)');
    process.exitCode = 1;
  }
});

(async () => {
  // --- Every write leaves a time, every delete a marker ---

  await test('books and name lists record when they last changed', async () => {
    const { S, stores } = makeEnv();
    await S.addNovel({ id: 'n1', title: 'One', slug: 'one' });
    const added = stores.novels.n1.updatedAt;
    assert(Number.isFinite(added) && added > 0, 'addNovel stamps updatedAt');
    await wait(5);
    await S.updateNovel('n1', { title: 'One!' });
    assert(stores.novels.n1.updatedAt > added, 'updateNovel moves it forward');
    await S.saveNameList('n1', [{ id: 'a', original: 'Lin Dong', translation: 'Lâm Động', addedAt: 1 }]);
    assert(Number.isFinite(stores.novels['namelist::n1'].updatedAt), 'a name list records its own time');
    const exported = await S.exportAll();
    const book = exported.novels.find((b) => b.id === 'n1');
    assert.strictEqual(book.listsUpdatedAt.namelist, stores.novels['namelist::n1'].updatedAt, 'exported with each list\'s time');
    assert.deepStrictEqual(plain(exported.deleted), { novels: {}, chapters: {}, names: {} }, 'and the deletion markers');
  });

  await test('deleting a book or a chapter leaves a marker that sync carries to other devices', async () => {
    const { S } = makeEnv();
    await S.addNovel({ id: 'n1', title: 'One', slug: 'one' });
    await S.addNovel({ id: 'n2', title: 'Two', slug: 'two' });
    await S.saveChapter({ novelId: 'n2', chapterNumber: 3, title: 'Three', rawText: 'x' });
    const before = Date.now();
    await S.deleteNovel('n1');
    await S.deleteChapter('n2', 3);
    const { deleted } = await S.exportAll();
    assert(deleted.novels.n1 >= before, 'book marker with its time');
    assert(deleted.chapters.n2_ch3 >= before, 'chapter marker with its time');
  });

  // --- Name list entries: their own times and deletion markers ---

  await test('each name entry records when it was added or edited; removing one leaves a marker', async () => {
    const { S, stores } = makeEnv();
    await S.addNovel({ id: 'n1', title: 'One', slug: 'one' });
    const a = await S.addNameEntry('n1', { original: 'Lin Dong', translation: 'Lâm Động' });
    const b = await S.addNameEntry('n1', { original: 'Wang Lin', translation: 'Vương Lâm' });
    const listOf = () => stores.novels['namelist::n1'].list;
    const timeOf = (id) => listOf().find((e) => e.id === id).updatedAt;
    assert(timeOf(a.id) > 0 && timeOf(b.id) > 0, 'new entries are stamped');
    const aTime = timeOf(a.id);
    await wait(5);
    await S.updateNameEntry('n1', b.id, { translation: 'Vương Lâm!' });
    assert.strictEqual(timeOf(a.id), aTime, 'untouched entries keep their time');
    assert(timeOf(b.id) > aTime, 'an edit moves its time forward');
    const bTime = timeOf(b.id);
    await wait(5);
    await S.saveNameList('n1', listOf().map((e) => ({ ...e, isNew: false })));
    assert.strictEqual(timeOf(b.id), bTime, 'marking names as seen is not an edit');
    await S.deleteNameEntry('n1', a.id);
    const { deleted } = await S.exportAll();
    assert(deleted.names.n1.namelist[a.id] >= bTime, 'a removed entry leaves a marker');
  });

  await test('moving a term between glossaries removes it from one list and adds it to the other', async () => {
    const { S } = makeEnv();
    await S.addNovel({ id: 'n1', title: 'One', slug: 'one' });
    const soft = await S.addNameEntry('n1', { original: 'Thanh Dương', translation: 'Qingyang' }, 'soft');
    const moved = await S.moveNameEntry('n1', soft.id, 'soft', 'locked');
    const { deleted, novels } = await S.exportAll();
    assert(deleted.names.n1.soft[soft.id], 'marker in the source list');
    const book = novels.find((n) => n.id === 'n1');
    assert(book.glossaries.locked.some((e) => e.id === moved.id && e.updatedAt > 0), 'stamped entry in the target list');
  });

  // --- Sync summaries: what sync reads instead of every chapter ---

  await test('each book keeps a summary of its chapters (id, number, change time) through every write', async () => {
    const { S, stores } = makeEnv();
    await S.addNovel({ id: 'n1', title: 'One', slug: 'one' });
    const c1 = await S.saveChapter({ novelId: 'n1', chapterNumber: 1, title: 'x', rawText: 'x' });
    const c2 = await S.saveChapter({ novelId: 'n1', chapterNumber: 51, title: 'y', rawText: 'y' });
    await wait(5);
    const c1b = await S.updateChapter('n1', 1, { rawText: 'x2' });
    await S.deleteChapter('n1', 51);
    assert.deepStrictEqual(plain(stores.syncState.n1.chapters), { n1_ch1: [c1b.updatedAt, 1] }, 'save, update and delete keep it current');
    assert(c1b.updatedAt > c1.updatedAt && c2.updatedAt);

    await S.applySync({ novels: [], chapters: [chapter('n1', 7, 77)], deleteNovels: [], deleteChapters: ['n1_ch1'], preferences: {} }, null);
    assert.deepStrictEqual(plain(stores.syncState.n1.chapters), { n1_ch7: [77, 7] }, 'and changes a sync applies');

    await S.deleteNovel('n1');
    assert.strictEqual(stores.syncState.n1, undefined, 'a deleted book loses its summary');
  });

  await test('the sync snapshot has every book and its chapter times without reading any chapter text', async () => {
    const { S, reads } = makeEnv();
    await S.addNovel({ id: 'n1', title: 'One', slug: 'one' });
    await S.saveNameList('n1', [{ id: 'a', original: 'A', translation: 'Á', addedAt: 1 }]);
    const c = await S.saveChapter({ novelId: 'n1', chapterNumber: 3, title: 'x', rawText: 'x' });
    reads.chapterGetAll = 0;
    const snapshot = await S.getSyncSnapshot();
    assert.strictEqual(reads.chapterGetAll, 0, 'no chapter read');
    assert.deepStrictEqual(plain(snapshot.chapterTimes), { n1: { n1_ch3: [c.updatedAt, 3] } });
    assert.strictEqual(snapshot.novels[0].nameList[0].original, 'A', 'books come with their name lists');
    assert(snapshot.deleted && snapshot.preferences, 'and the markers and settings');
    const loaded = await S.getChaptersByIds(['n1_ch3', 'missing']);
    assert.deepStrictEqual(plain(loaded.map((ch) => ch.rawText)), ['x'], 'chapters are loaded by id only when needed');
  });

  await test('a library from before summaries gets them built once', async () => {
    const { S, stores, reads } = makeEnv();
    stores.novels.n1 = { id: 'n1', title: 'Old', slug: 'old', updatedAt: 5 };
    stores.chapters.n1_ch1 = { id: 'n1_ch1', novelId: 'n1', chapterNumber: 1, rawText: 'old', updatedAt: 6 };
    stores.novels.n2 = { id: 'n2', title: 'Empty', slug: 'empty', updatedAt: 5 };
    const first = await S.getSyncSnapshot();
    assert.deepStrictEqual(plain(first.chapterTimes), { n1: { n1_ch1: [6, 1] }, n2: {} });
    assert.strictEqual(reads.chapterGetAll, 1, 'one full read to build them');
    await S.getSyncSnapshot();
    assert.strictEqual(reads.chapterGetAll, 1, 'never again');
    await S.importAll(library({ novels: [novel('n3', 1)], chapters: [chapter('n3', 2, 9)] }), { replace: true });
    const afterImport = await S.getSyncSnapshot();
    assert.deepStrictEqual(plain(afterImport.chapterTimes), { n3: { n3_ch2: [9, 2] } }, 'an import rebuilds them');
  });

  // --- Change tracking (what triggers an automatic sync) ---

  await test('every change to the library is announced and leaves a "not synced yet" mark; applying a sync does not', async () => {
    const { S, ls } = makeEnv();
    const seen = [];
    const stop = S.onLibraryChanged((change) => seen.push(change.kind));
    await S.addNovel({ id: 'n1', title: 'One', slug: 'one' });
    await S.updateNovel('n1', { title: 'One!' });
    await S.saveNameList('n1', [{ id: 'a', original: 'A', translation: 'Á', addedAt: 1 }]);
    await S.saveChapter({ novelId: 'n1', chapterNumber: 1, title: 'x', rawText: 'x' });
    await S.updateChapter('n1', 1, { rawText: 'y' });
    await S.setLastRead('n1', { chapterNumber: 1, paragraph: 2 });
    await S.deleteChapter('n1', 1);
    await S.deleteNovel('n1');
    assert.deepStrictEqual(seen, ['novel', 'novel', 'names', 'chapter', 'chapter', 'reading', 'chapter', 'novel']);
    assert(Number(ls.quickconverter_sync_dirty_at) > 0, 'marked as changed since the last sync');
    seen.length = 0;
    await S.applySync({ novels: [novel('n2', 5)], chapters: [chapter('n2', 1, 5)], deleteNovels: [], deleteChapters: [], preferences: {} }, null);
    assert.deepStrictEqual(seen, [], 'changes that came from a sync are not announced again');
    stop();
    await S.addNovel({ id: 'n3', title: 'Three', slug: 'three' });
    assert.deepStrictEqual(seen, [], 'stops listening');
  });

  // --- AutoSync: when the library syncs by itself ---

  function fakeClock(start = 1000000) {
    let t = start;
    let seq = 0;
    const timers = new Map();
    return {
      now: () => t,
      setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { at: t + ms, fn }); return id; },
      clearTimeout: (id) => { timers.delete(id); },
      async advance(ms) {
        const end = t + ms;
        for (;;) {
          const due = Array.from(timers.entries()).filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
          if (!due) break;
          timers.delete(due[0]);
          t = due[1].at;
          due[1].fn();
          for (let i = 0; i < 10; i++) await Promise.resolve();
        }
        t = end;
      },
      pending: () => timers.size
    };
  }

  function autoSyncHarness({ lastSyncAgoMs = null, dirty = false, enabled = true, syncImpl } = {}) {
    const env = { console: { log() {}, warn() {}, error() {} } };
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'services', 'auto-sync.js'), env);
    const clock = fakeClock();
    const prefs = {};
    if (lastSyncAgoMs !== null) prefs.quickconverter_last_sync_at = new Date(clock.now() - lastSyncAgoMs).toISOString();
    if (dirty) prefs.quickconverter_sync_dirty_at = String(clock.now() - 1);
    if (!enabled) prefs.quickconverter_auto_sync = 'false';
    const syncs = [];
    const holds = [];
    const statuses = [];
    let changeListener = null;
    let visibleListener = null;
    const auto = env.AutoSync.create({
      sync: syncImpl || (async () => { syncs.push(clock.now()); prefs.quickconverter_last_sync_at = new Date(clock.now()).toISOString(); return { received: { novels: 0, chapters: 0, deleted: 0 } }; }),
      getPreference: (k, d) => (k in prefs ? prefs[k] : d),
      setPreference: (k, v) => { prefs[k] = String(v); },
      removePreference: (k) => { delete prefs[k]; },
      subscribeChanges: (fn) => { changeListener = fn; return () => { changeListener = null; }; },
      subscribeVisible: (fn) => { visibleListener = fn; return () => { visibleListener = null; }; },
      hold: (text) => holds.push(['hold', text]),
      release: () => holds.push(['release']),
      onStatus: (s) => statuses.push(plain(s)),
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout
    });
    return { auto, clock, prefs, syncs, holds, statuses, change: () => changeListener && changeListener({ kind: 'chapter' }), visible: () => visibleListener && visibleListener() };
  }

  await test('on open the library syncs shortly after, unless it synced moments ago and nothing changed', async () => {
    const fresh = autoSyncHarness({ lastSyncAgoMs: null });
    fresh.auto.start();
    await fresh.clock.advance(1999);
    assert.strictEqual(fresh.syncs.length, 0, 'lets the page settle first');
    await fresh.clock.advance(1);
    assert.strictEqual(fresh.syncs.length, 1, 'never synced: syncs on open');

    const recent = autoSyncHarness({ lastSyncAgoMs: 10 * 1000 });
    recent.auto.start();
    await recent.clock.advance(5000);
    assert.strictEqual(recent.syncs.length, 0, 'synced 10 s ago: no need');

    const recentDirty = autoSyncHarness({ lastSyncAgoMs: 10 * 1000, dirty: true });
    recentDirty.auto.start();
    await recentDirty.clock.advance(5000);
    assert.strictEqual(recentDirty.syncs.length, 1, 'but something changed since: syncs');
  });

  await test('changes sync about 30 s after the last one, as a single sync', async () => {
    const h = autoSyncHarness({ lastSyncAgoMs: 1000 });
    h.auto.start();
    h.change();
    await h.clock.advance(20000);
    h.change();
    h.change();
    await h.clock.advance(29999);
    assert.strictEqual(h.syncs.length, 0, 'waits for the changes to settle');
    await h.clock.advance(1);
    assert.strictEqual(h.syncs.length, 1, 'one sync for the burst');
    assert.strictEqual(h.prefs.quickconverter_sync_dirty_at, undefined, 'the change mark is cleared after syncing');
  });

  await test('coming back to the app syncs if the last sync is over a minute old; it also syncs every 15 minutes while open', async () => {
    const h = autoSyncHarness({ lastSyncAgoMs: 1000 });
    h.auto.start();
    h.visible();
    await h.clock.advance(3000);
    assert.strictEqual(h.syncs.length, 0, 'just synced');
    await h.clock.advance(60000);
    h.visible();
    await h.clock.advance(3000);
    assert.strictEqual(h.syncs.length, 1, 'over a minute: syncs');
    await h.clock.advance(15 * 60 * 1000);
    assert.strictEqual(h.syncs.length, 2, 'and periodically');
  });

  await test('a sync never overlaps another; a change during a sync leads to one more sync after it', async () => {
    let finish = null;
    const syncs = [];
    const h = autoSyncHarness({
      lastSyncAgoMs: null,
      syncImpl: () => { syncs.push('start'); return new Promise((resolve) => { finish = () => resolve({ received: { novels: 0, chapters: 0, deleted: 0 } }); }); }
    });
    h.auto.start();
    await h.clock.advance(2000);
    assert.deepStrictEqual(syncs, ['start']);
    h.change();
    await h.clock.advance(31000);
    assert.deepStrictEqual(syncs, ['start'], 'no second sync while the first runs');
    finish();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await h.clock.advance(31000);
    assert.deepStrictEqual(syncs, ['start', 'start'], 'the change made during it syncs afterwards');
  });

  await test('another open page that is syncing right now is left alone; a stale lock is ignored', async () => {
    const h = autoSyncHarness({ lastSyncAgoMs: null });
    h.prefs.quickconverter_sync_lock = String(h.clock.now());
    h.auto.start();
    await h.clock.advance(2000);
    assert.strictEqual(h.syncs.length, 0, 'another page holds the lock');
    await h.clock.advance(3 * 60 * 1000);
    assert.strictEqual(h.syncs.length, 1, 'tries again later and a lock older than 2 minutes is stale');
    assert.strictEqual(h.prefs.quickconverter_sync_lock, undefined, 'lets go of its own lock');
  });

  await test('signed out: it waits quietly; other errors are reported and retried in 5 minutes', async () => {
    let signedOutCalls = 0;
    const signedOut = autoSyncHarness({ lastSyncAgoMs: null, syncImpl: async () => { signedOutCalls++; throw new Error('No Google auth token returned'); } });
    signedOut.auto.start();
    await signedOut.clock.advance(2000);
    assert.strictEqual(signedOut.statuses[signedOut.statuses.length - 1].state, 'signed-out');
    await signedOut.clock.advance(10 * 60 * 1000);
    assert.strictEqual(signedOutCalls, 1, 'no retries while signed out');

    let calls = 0;
    const failing = autoSyncHarness({ lastSyncAgoMs: null, syncImpl: async () => { calls++; if (calls === 1) throw new Error('Google Drive upload failed (503)'); return { received: { novels: 0, chapters: 0, deleted: 0 } }; } });
    failing.auto.start();
    await failing.clock.advance(2000);
    const error = failing.statuses[failing.statuses.length - 1];
    assert.strictEqual(error.state, 'error');
    assert(/503/.test(error.error));
    await failing.clock.advance(5 * 60 * 1000);
    assert.strictEqual(calls, 2, 'retried');
    assert.strictEqual(failing.statuses[failing.statuses.length - 1].state, 'idle');
  });

  await test('while syncing it keeps the app alive and reports progress; turned off, it does nothing', async () => {
    const h = autoSyncHarness({ lastSyncAgoMs: null });
    h.auto.start();
    await h.clock.advance(2000);
    assert.deepStrictEqual(plain(h.holds), [['hold', 'Syncing library…'], ['release']]);
    assert.deepStrictEqual(h.statuses.map((s) => s.state), ['syncing', 'idle']);
    assert(h.statuses[1].lastSyncAt, 'reports when it synced');

    const off = autoSyncHarness({ lastSyncAgoMs: null, dirty: true, enabled: false });
    off.auto.start();
    off.change();
    off.visible();
    await off.clock.advance(60 * 60 * 1000);
    assert.strictEqual(off.syncs.length, 0);
    assert.strictEqual(off.statuses[off.statuses.length - 1].state, 'off');
  });

  await test('pages that show the library load the sync code after storage', () => {
    for (const view of ['library', 'novel', 'reader']) {
      const html = read('src', 'views', `${view}.html`);
      const storageAt = html.indexOf('../services/storage.js');
      const cloudAt = html.indexOf('../services/cloud-sync.js');
      const autoAt = html.indexOf('../services/auto-sync.js');
      assert(storageAt > -1 && cloudAt > storageAt && autoAt > cloudAt, `${view}.html loads storage, cloud-sync, then auto-sync`);
    }
  });

  // --- The merge itself (pure) ---

  await test('with nothing in Drive yet, the merge is this device\'s library and changes nothing here', () => {
    const { S } = makeEnv();
    const local = library({ novels: [novel('n1', 10)], chapters: [chapter('n1', 1, 10)] });
    const { library: merged, apply } = S.mergeLibraries(local, null);
    assert.deepStrictEqual(plain(merged.novels.map((b) => b.id)), ['n1']);
    assert.deepStrictEqual(plain(apply), { novels: [], chapters: [], deleteNovels: [], deleteChapters: [], preferences: {} });
  });

  await test('books and chapters from either device end up on both', () => {
    const { S } = makeEnv();
    const local = library({ novels: [novel('n1', 10)], chapters: [chapter('n1', 1, 10)] });
    const remote = library({ novels: [novel('n2', 20)], chapters: [chapter('n2', 1, 20), chapter('n1', 2, 30)] });
    const { library: merged, apply } = S.mergeLibraries(local, remote);
    assert.deepStrictEqual(plain(merged.novels.map((b) => b.id).sort()), ['n1', 'n2']);
    assert.deepStrictEqual(plain(merged.chapters.map((c) => c.id).sort()), ['n1_ch1', 'n1_ch2', 'n2_ch1']);
    assert.deepStrictEqual(plain(apply.novels.map((b) => b.id)), ['n2'], 'only what this device lacks is written here');
    assert.deepStrictEqual(plain(apply.chapters.map((c) => c.id).sort()), ['n1_ch2', 'n2_ch1']);
  });

  await test('the newer copy of a book or chapter wins; an equal or older copy changes nothing', () => {
    const { S } = makeEnv();
    const local = library({
      novels: [novel('n1', 50, { title: 'Local title' }), novel('n2', 10, { title: 'Old' })],
      chapters: [chapter('n1', 1, 50, 'local text'), chapter('n1', 2, 10, 'old text')]
    });
    const remote = library({
      novels: [novel('n1', 40, { title: 'Remote title' }), novel('n2', 30, { title: 'New' })],
      chapters: [chapter('n1', 1, 40, 'remote text'), chapter('n1', 2, 30, 'translated text')]
    });
    const { library: merged, apply } = S.mergeLibraries(local, remote);
    const byId = (list, id) => list.find((x) => x.id === id);
    assert.strictEqual(byId(merged.novels, 'n1').title, 'Local title');
    assert.strictEqual(byId(merged.novels, 'n2').title, 'New');
    assert.strictEqual(byId(merged.chapters, 'n1_ch1').rawText, 'local text');
    assert.strictEqual(byId(merged.chapters, 'n1_ch2').rawText, 'translated text');
    assert.deepStrictEqual(plain(apply.novels.map((b) => b.id)), ['n2']);
    assert.deepStrictEqual(plain(apply.chapters.map((c) => c.id)), ['n1_ch2']);

    const same = S.mergeLibraries(local, local);
    assert.deepStrictEqual(plain(same.apply.novels), [], 'syncing with an identical copy writes nothing');
    assert.deepStrictEqual(plain(same.apply.chapters), []);
  });

  await test('the reading position follows the device that read last, whatever else changed', () => {
    const { S } = makeEnv();
    const local = library({ novels: [novel('n1', 50, { title: 'Synced catalog', lastRead: { chapterNumber: 3, paragraph: 0, updatedAt: 100 } })] });
    const remote = library({ novels: [novel('n1', 40, { title: 'Old', lastRead: { chapterNumber: 120, paragraph: 7, updatedAt: 200 } })] });
    const { library: merged, apply } = S.mergeLibraries(local, remote);
    const book = merged.novels[0];
    assert.strictEqual(book.title, 'Synced catalog', 'the newer book record');
    assert.deepStrictEqual(plain(book.lastRead), { chapterNumber: 120, paragraph: 7, updatedAt: 200 }, 'with the later reading position');
    assert.strictEqual(apply.novels.length, 1, 'written here because the position changed');
  });

  await test('each name list and glossary combines both copies; its time is the newest of either', () => {
    const { S } = makeEnv();
    const names = (label) => [{ id: label, original: label, translation: label, addedAt: 1 }];
    const local = library({ novels: [novel('n1', 10, { nameList: names('local-names'), glossaries: { locked: names('local-locked'), soft: [] }, listsUpdatedAt: { namelist: 50, locked: 10, soft: 0 } })] });
    const remote = library({ novels: [novel('n1', 10, { nameList: names('remote-names'), glossaries: { locked: names('remote-locked'), soft: names('remote-soft') }, listsUpdatedAt: { namelist: 40, locked: 30, soft: 5 } })] });
    const { library: merged } = S.mergeLibraries(local, remote);
    const book = merged.novels[0];
    assert.deepStrictEqual(plain(book.nameList.map((e) => e.id).sort()), ['local-names', 'remote-names']);
    assert.deepStrictEqual(plain(book.glossaries.locked.map((e) => e.id).sort()), ['local-locked', 'remote-locked']);
    assert.deepStrictEqual(plain(book.glossaries.soft.map((e) => e.id)), ['remote-soft']);
    assert.deepStrictEqual(plain(book.listsUpdatedAt), { namelist: 50, locked: 30, soft: 5 });
  });

  const entry = (id, original, translation, updatedAt, extra = {}) => ({ id, original, translation, addedAt: 1, updatedAt, ...extra });
  const withNames = (id, lists, times = {}) => novel(id, 10, {
    nameList: lists.namelist || [],
    glossaries: { locked: lists.locked || [], soft: lists.soft || [] },
    listsUpdatedAt: { namelist: times.namelist || 0, locked: times.locked || 0, soft: times.soft || 0 }
  });

  await test('name lists merge entry by entry: additions and edits from both devices are kept', () => {
    const { S } = makeEnv();
    const local = library({ novels: [withNames('n1', { namelist: [entry('a', 'Lin Dong', 'Lâm Động', 50), entry('c', 'Xiao Yan', 'Tiêu Viêm', 10)] }, { namelist: 50 })] });
    const remote = library({ novels: [withNames('n1', { namelist: [entry('b', 'Wang Lin', 'Vương Lâm', 60), entry('c', 'Xiao Yan', 'Tiêu Viêm (edited)', 40)] }, { namelist: 60 })] });
    const { library: merged, apply } = S.mergeLibraries(local, remote);
    const names = merged.novels[0].nameList;
    assert.deepStrictEqual(plain(names.map((e) => e.id).sort()), ['a', 'b', 'c'], 'both additions');
    assert.strictEqual(names.find((e) => e.id === 'c').translation, 'Tiêu Viêm (edited)', 'the newer edit of the same entry');
    assert.strictEqual(merged.novels[0].listsUpdatedAt.namelist, 60, 'the list time follows its newest entry');
    assert.strictEqual(apply.novels.length, 1, 'written here because it gained entries');
  });

  await test('a removed name stays removed on the other device, unless it was edited after', () => {
    const { S } = makeEnv();
    const local = library({ novels: [withNames('n1', { namelist: [entry('a', 'Lin Dong', 'Lâm Động', 10), entry('b', 'Wang Lin', 'Vương Lâm', 90)] }, { namelist: 90 })] });
    const remote = library({
      novels: [withNames('n1', { namelist: [] }, { namelist: 50 })],
      deleted: { novels: {}, chapters: {}, names: { n1: { namelist: { a: 50, b: 50 } } } }
    });
    const { library: merged } = S.mergeLibraries(local, remote);
    assert.deepStrictEqual(plain(merged.novels[0].nameList.map((e) => e.id)), ['b'], 'a removed; b edited after the removal stays');
    assert.deepStrictEqual(plain(merged.deleted.names.n1.namelist), { a: 50 }, 'the outdated marker for b is dropped');
  });

  await test('the same name added on both devices ends up once; old entries without times simply combine', () => {
    const { S } = makeEnv();
    const local = library({ novels: [withNames('n1', { namelist: [entry('x1', 'Lin Dong', 'Lâm Động', 30), { id: 'old1', original: 'Old A', translation: 'A', addedAt: 1 }] })] });
    const remote = library({ novels: [withNames('n1', { namelist: [entry('x2', 'lin dong ', 'Lâm Động (fixed)', 70), { id: 'old2', original: 'Old B', translation: 'B', addedAt: 1 }] })] });
    const { library: merged } = S.mergeLibraries(local, remote);
    const names = merged.novels[0].nameList;
    const lin = names.filter((e) => e.original.trim().toLowerCase() === 'lin dong');
    assert.strictEqual(lin.length, 1, 'one entry');
    assert.strictEqual(lin[0].translation, 'Lâm Động (fixed)', 'the newer one');
    assert.deepStrictEqual(plain(names.map((e) => e.id).filter((id) => id.startsWith('old')).sort()), ['old1', 'old2']);
  });

  await test('a glossary move made on one device arrives as a move', () => {
    const { S } = makeEnv();
    const local = library({ novels: [withNames('n1', { soft: [entry('s1', 'Thanh Dương', 'Qingyang', 10)] }, { soft: 10 })] });
    const remote = library({
      novels: [withNames('n1', { locked: [entry('l1', 'Thanh Dương', 'Qingyang', 80)] }, { locked: 80, soft: 80 })],
      deleted: { novels: {}, chapters: {}, names: { n1: { soft: { s1: 80 } } } }
    });
    const { library: merged } = S.mergeLibraries(local, remote);
    assert.deepStrictEqual(plain(merged.novels[0].glossaries.soft), []);
    assert.deepStrictEqual(plain(merged.novels[0].glossaries.locked.map((e) => e.id)), ['l1']);
  });

  await test('both devices reach the same merge, so they never keep re-uploading each other\'s copy', () => {
    const { S } = makeEnv();
    const one = library({ novels: [withNames('n1', { namelist: [entry('a', 'A', 'a', 30, { addedAt: 3 }), entry('c', 'C', 'c', 10, { addedAt: 1 })] }, { namelist: 30 })] });
    const two = library({ novels: [withNames('n1', { namelist: [entry('b', 'B', 'b', 20, { addedAt: 2 }), entry('c', 'C', 'c', 10, { addedAt: 1 })] }, { namelist: 20 })] });
    const ab = S.mergeLibraries(one, two).library.novels[0];
    const ba = S.mergeLibraries(two, one).library.novels[0];
    assert.deepStrictEqual(plain(ab.nameList), plain(ba.nameList), 'same list in the same order, whichever side merges');
    assert.deepStrictEqual(plain(ab.nameList.map((e) => e.id)), ['a', 'b', 'c'], 'newest first');

    const oldA = library({ novels: [novel('n2', 0, { title: 'Cover A' })] });
    const oldB = library({ novels: [novel('n2', 0, { title: 'Cover B' })] });
    assert.strictEqual(S.mergeLibraries(oldA, oldB).library.novels[0].title, S.mergeLibraries(oldB, oldA).library.novels[0].title, 'equal times: the same copy wins on both sides');
    const sameName = (title) => library({ novels: [withNames('n3', { namelist: [entry('x', 'Lin', title, 0)] })] });
    assert.strictEqual(
      S.mergeLibraries(sameName('Lâm'), sameName('Lam')).library.novels[0].nameList[0].translation,
      S.mergeLibraries(sameName('Lam'), sameName('Lâm')).library.novels[0].nameList[0].translation,
      'old entries without times: the same edit wins on both sides'
    );
  });

  await test('a book deleted on one device is deleted on the other, unless it was changed after', () => {
    const { S } = makeEnv();
    const local = library({
      novels: [novel('n1', 10), novel('n2', 10), novel('n3', 500)],
      chapters: [chapter('n1', 1, 10), chapter('n2', 1, 10), chapter('n2', 2, 10)]
    });
    const remote = library({ deleted: { novels: { n1: 100, n3: 100 }, chapters: { n2_ch2: 100 } } });
    const { library: merged, apply } = S.mergeLibraries(local, remote);
    assert.deepStrictEqual(plain(merged.novels.map((b) => b.id).sort()), ['n2', 'n3'], 'n1 deleted; n3 re-added after the deletion stays');
    assert.deepStrictEqual(plain(merged.chapters.map((c) => c.id)), ['n2_ch1'], 'the deleted book\'s chapters and the deleted chapter go');
    assert.deepStrictEqual(plain(apply.deleteNovels), ['n1']);
    assert.deepStrictEqual(plain(apply.deleteChapters.sort()), ['n1_ch1', 'n2_ch2']);
    assert.deepStrictEqual(plain(merged.deleted.novels), { n1: 100 }, 'the outdated n3 marker is dropped');
    assert.deepStrictEqual(plain(merged.deleted.chapters), { n2_ch2: 100 });

    const back = S.mergeLibraries(library({ novels: [novel('n2', 10)] }), library({ novels: [novel('n1', 10)], deleted: { novels: {}, chapters: {} } }));
    assert(back.library.novels.some((b) => b.id === 'n1'), 'without a marker a book is never dropped');
  });

  await test('settings stay as they are on this device; only missing ones are filled in, never API keys', () => {
    const { S } = makeEnv();
    const local = library({ preferences: { quickconverter_reader_font_size: '20' } });
    const remote = library({ preferences: { quickconverter_reader_font_size: '24', quickconverter_reader_theme: 'sepia', quickconverter_deepseek_key: 'SECRET' } });
    const { library: merged, apply } = S.mergeLibraries(local, remote);
    assert.deepStrictEqual(plain(apply.preferences), { quickconverter_reader_theme: 'sepia' });
    assert.strictEqual(merged.preferences.quickconverter_reader_font_size, '20');
    assert.strictEqual(merged.preferences.quickconverter_deepseek_key, undefined);
  });

  await test('an older backup without times never overwrites this device, but its extra books are added', () => {
    const { S } = makeEnv();
    const local = library({ novels: [novel('n1', 10, { title: 'Mine' })], chapters: [chapter('n1', 1, 10, 'mine')] });
    const old = { format: 'quickconverter-backup', version: 1, novels: [{ id: 'n1', title: 'Old' }, { id: 'n9', title: 'Extra' }], chapters: [{ id: 'n1_ch1', novelId: 'n1', chapterNumber: 1, rawText: 'old' }], preferences: {} };
    const { library: merged, apply } = S.mergeLibraries(local, old);
    assert.strictEqual(merged.novels.find((b) => b.id === 'n1').title, 'Mine');
    assert.strictEqual(merged.chapters.find((c) => c.id === 'n1_ch1').rawText, 'mine');
    assert.deepStrictEqual(plain(apply.novels.map((b) => b.id)), ['n9']);
  });

  // --- Applying a merge on this device ---

  await test('applySync writes the merged changes here, keeping their times, and remembers the markers', async () => {
    const { S, stores, ls } = makeEnv();
    await S.addNovel({ id: 'n1', title: 'One', slug: 'one' });
    await S.addNovel({ id: 'gone', title: 'Gone', slug: 'gone' });
    await S.saveChapter({ novelId: 'gone', chapterNumber: 1, title: 'x', rawText: 'x' });
    await S.applySync({
      novels: [novel('n2', 77, { nameList: [{ id: 'a', original: 'A', translation: 'Á', addedAt: 1 }], listsUpdatedAt: { namelist: 66, locked: 0, soft: 0 } })],
      chapters: [chapter('n2', 1, 88, 'remote')],
      deleteNovels: ['gone'],
      deleteChapters: ['gone_ch1'],
      preferences: { quickconverter_reader_theme: 'sepia' }
    }, { novels: { gone: 99 }, chapters: {} });
    assert.strictEqual(stores.novels.n2.updatedAt, 77, 'the book keeps its time, so it does not look newly changed');
    assert.strictEqual(stores.novels.n2.listsUpdatedAt, undefined, 'list times live on the list records');
    assert.strictEqual(stores.novels['namelist::n2'].updatedAt, 66);
    assert.strictEqual(stores.novels['namelist::n2'].list[0].id, 'a');
    assert.strictEqual(stores.chapters.n2_ch1.updatedAt, 88);
    assert.strictEqual(stores.novels.gone, undefined);
    assert.strictEqual(stores.chapters.gone_ch1, undefined);
    assert.strictEqual(ls.quickconverter_reader_theme, 'sepia');
    assert.deepStrictEqual(plain((await S.exportAll()).deleted), { novels: { gone: 99 }, chapters: {}, names: {} }, 'markers kept for the next sync');
    assert(stores.novels.n1, 'untouched books stay');
  });

  await test('restoring a backup file keeps list times on the list records', async () => {
    const { S, stores } = makeEnv();
    await S.importAll(library({ novels: [novel('n5', 5, { nameList: [{ id: 'z', original: 'Z', translation: 'Z', addedAt: 1 }], listsUpdatedAt: { namelist: 55, locked: 0, soft: 0 } })] }), { replace: true });
    assert.strictEqual(stores.novels.n5.listsUpdatedAt, undefined);
    assert.strictEqual(stores.novels['namelist::n5'].updatedAt, 55);
  });

  console.log(`--- Library Sync Test Suite: ${passed}/${passed + failed} passed ---`);
  if (failed > 0) {
    console.error('Library Sync Test Suite FAILED');
    process.exit(1);
  }
  console.log('Library Sync Test Suite: ALL TESTS PASSED!');
  finished = true;
})();
