// QuickConverter - Download Queue Unit Test Suite
// Validates sequential processing, FIFO ordering, pause/resume, individual cancellation,
// clear all, error resilience (skip to next), and status queries.

const assert = require('assert');

// Mock chrome environment for test execution
global.chrome = {
  storage: {
    local: {
      data: {},
      get(keys, cb) {
        cb(this.data);
      },
      set(items, cb) {
        Object.assign(this.data, items);
        if (cb) cb();
      }
    }
  },
  runtime: {
    sendMessage(msg, cb) {
      if (cb) cb({ success: true });
    },
    onMessage: {
      addListener() {}
    }
  }
};

// Mock StorageService
let downloadedTasks = [];
let startedTasks = [];
let mockFailChapter = null;
let mockDelayMs = 20;
let mockTranslationDelay = 0;

const mockStorageService = {
  async downloadChapter(novelId, chNum, options) {
    startedTasks.push({ novelId, chapterNumber: Number(chNum) });
    if (options && options.signal && options.signal.aborted) {
      throw new Error('UserCancelled');
    }

    if (mockFailChapter === Number(chNum)) {
      throw new Error(`Simulated download error for chapter ${chNum}`);
    }

    // Simulate chunk streaming and progress
    if (options && typeof options.onChunk === 'function') {
      options.onChunk({ type: 'content', text: 'Hello', fullText: 'Hello' });
    }
    if (options && typeof options.onProgress === 'function') {
      options.onProgress({ phase: 'fetching', percent: 5, text: 'Fetching raw chapter...' });
      options.onProgress({ phase: 'translating', percent: 45, text: 'Translating (45%)...' });
    }

    // Simulate async execution with delay and abort checking
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        downloadedTasks.push({ novelId, chapterNumber: Number(chNum) });
        resolve({ success: true });
      }, mockDelayMs);

      if (options && options.signal) {
        options.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('UserCancelled'));
        });
      }
    });

    return { success: true, translationDelay: mockTranslationDelay };
  }
};

global.StorageService = mockStorageService;

// Load DownloadQueueService fresh
delete require.cache[require.resolve('../src/services/download-queue.js')];
const DownloadQueueService = require('../src/services/download-queue.js');
DownloadQueueService.cooldownEnabled = false;

async function runTests() {
  console.log('\n--- Running DownloadQueueService Test Suite ---');
  let passedCount = 0;

  function test(name, fn) {
    return (async () => {
      try {
        await fn();
        console.log(`  ✓ ${name}`);
        passedCount++;
      } catch (err) {
        console.error(`  ✗ ${name}`);
        console.error(err);
        process.exit(1);
      }
    })();
  }

  // 1. Enqueue and Sequential Execution Test
  await test('Processes multiple enqueued chapters sequentially in FIFO order (concurrency: 1)', async () => {
    downloadedTasks = [];
    mockFailChapter = null;
    mockDelayMs = 30;
    DownloadQueueService.clearAll();

    // Enqueue 3 chapters
    await DownloadQueueService.enqueue({ novelId: 'regressor', chapterNumber: 1, chapterTitle: 'Ch 1' });
    await DownloadQueueService.enqueue({ novelId: 'regressor', chapterNumber: 2, chapterTitle: 'Ch 2' });
    await DownloadQueueService.enqueue({ novelId: 'regressor', chapterNumber: 3, chapterTitle: 'Ch 3' });

    // Verify initial queue state
    const state = DownloadQueueService.getState();
    assert.strictEqual(state.isProcessing, true, 'Queue should be processing');
    assert.strictEqual(state.activeTask.chapterNumber, 1, 'Active chapter should be 1');
    assert.strictEqual(state.queue.length, 2, 'Queue should have 2 waiting chapters');
    assert.strictEqual(state.totalCount, 3, 'Total count should be 3');

    // Wait for all 3 to finish
    await new Promise((resolve) => {
      const unsub = DownloadQueueService.subscribe((s) => {
        if (s.totalCount === 0 && !s.isProcessing) {
          unsub();
          resolve();
        }
      });
    });

    assert.strictEqual(downloadedTasks.length, 3, 'All 3 chapters should be downloaded');
    assert.strictEqual(downloadedTasks[0].chapterNumber, 1, 'Ch 1 was downloaded first');
    assert.strictEqual(downloadedTasks[1].chapterNumber, 2, 'Ch 2 was downloaded second');
    assert.strictEqual(downloadedTasks[2].chapterNumber, 3, 'Ch 3 was downloaded third');
  });

  // 2. Duplicate Check Test
  await test('Rejects duplicate chapters from being queued twice', async () => {
    DownloadQueueService.clearAll();
    mockDelayMs = 100;

    const res1 = await DownloadQueueService.enqueue({ novelId: 'novel-a', chapterNumber: 5 });
    assert.strictEqual(res1.success, true, 'First enqueue should succeed');

    const res2 = await DownloadQueueService.enqueue({ novelId: 'novel-a', chapterNumber: 5 });
    assert.strictEqual(res2.success, false, 'Duplicate enqueue should fail');
    assert.strictEqual(res2.alreadyQueued, true, 'Should indicate alreadyQueued');

    DownloadQueueService.clearAll();
  });

  // 3. Status Query Test
  await test('getChapterStatus returns accurate status for processing and queued items', async () => {
    DownloadQueueService.clearAll();
    mockDelayMs = 150;

    await DownloadQueueService.enqueue({ novelId: 'novel-b', chapterNumber: 10 });
    await DownloadQueueService.enqueue({ novelId: 'novel-b', chapterNumber: 11 });
    await DownloadQueueService.enqueue({ novelId: 'novel-b', chapterNumber: 12 });

    const status10 = DownloadQueueService.getChapterStatus('novel-b', 10);
    assert(status10, 'Status for Ch 10 should exist');
    assert.strictEqual(status10.status, 'processing', 'Ch 10 should be processing');

    const status11 = DownloadQueueService.getChapterStatus('novel-b', 11);
    assert(status11, 'Status for Ch 11 should exist');
    assert.strictEqual(status11.status, 'queued', 'Ch 11 should be queued');
    assert.strictEqual(status11.queuePosition, 1, 'Ch 11 should be position 1');

    const status12 = DownloadQueueService.getChapterStatus('novel-b', 12);
    assert.strictEqual(status12.status, 'queued', 'Ch 12 should be queued');
    assert.strictEqual(status12.queuePosition, 2, 'Ch 12 should be position 2');

    const status99 = DownloadQueueService.getChapterStatus('novel-b', 99);
    assert.strictEqual(status99, null, 'Non-existent chapter should return null');

    DownloadQueueService.clearAll();
  });

  // 4. Remove waiting item test
  await test('Removes a waiting chapter from the queue with remove(taskId)', async () => {
    DownloadQueueService.clearAll();
    mockDelayMs = 100;

    await DownloadQueueService.enqueue({ novelId: 'novel-c', chapterNumber: 20 });
    await DownloadQueueService.enqueue({ novelId: 'novel-c', chapterNumber: 21 });
    await DownloadQueueService.enqueue({ novelId: 'novel-c', chapterNumber: 22 });

    const removed = await DownloadQueueService.remove('novel-c_ch21');
    assert.strictEqual(removed, true, 'Remove should succeed');

    const state = DownloadQueueService.getState();
    assert.strictEqual(state.queue.length, 1, 'Waiting queue should have 1 item left');
    assert.strictEqual(state.queue[0].chapterNumber, 22, 'Remaining waiting item should be Ch 22');

    DownloadQueueService.clearAll();
  });

  // 5. Abort active task test
  await test('Cancelling active task aborts in-flight download and auto-advances to next', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    mockDelayMs = 100;

    await DownloadQueueService.enqueue({ novelId: 'novel-d', chapterNumber: 30 });
    await DownloadQueueService.enqueue({ novelId: 'novel-d', chapterNumber: 31 });

    // Cancel active Ch 30 immediately
    const cancelled = await DownloadQueueService.remove('novel-d_ch30');
    assert.strictEqual(cancelled, true, 'Active task cancellation should return true');

    // Wait for Ch 31 to complete
    await new Promise((resolve) => {
      const unsub = DownloadQueueService.subscribe((s) => {
        if (s.totalCount === 0 && !s.isProcessing) {
          unsub();
          resolve();
        }
      });
    });

    assert.strictEqual(downloadedTasks.length, 1, 'Only 1 chapter should be downloaded');
    assert.strictEqual(downloadedTasks[0].chapterNumber, 31, 'Ch 31 should be downloaded, Ch 30 was aborted');
  });

  // 6. Pause and Resume test (Option A: finishes current chapter, holds next)
  await test('Pause queue allows active chapter to finish and pauses before next; Resume continues', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    mockDelayMs = 60;

    await DownloadQueueService.enqueue({ novelId: 'novel-e', chapterNumber: 40 });
    await DownloadQueueService.enqueue({ novelId: 'novel-e', chapterNumber: 41 });

    // Pause while Ch 40 is running
    DownloadQueueService.pause();
    assert.strictEqual(DownloadQueueService.getState().isPaused, true, 'Queue should be paused');

    // Wait for Ch 40 to finish
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Ch 40 should have completed, but Ch 41 should NOT have started
    assert.strictEqual(downloadedTasks.length, 1, 'Active chapter should finish while paused');
    assert.strictEqual(downloadedTasks[0].chapterNumber, 40, 'Ch 40 finished');

    const pausedState = DownloadQueueService.getState();
    assert.strictEqual(pausedState.activeTask, null, 'No active task while paused');
    assert.strictEqual(pausedState.queue.length, 1, 'Ch 41 is waiting');
    assert.strictEqual(pausedState.isProcessing, false, 'Should not be processing while paused');

    // Resume queue
    DownloadQueueService.resume();
    assert.strictEqual(DownloadQueueService.getState().isPaused, false, 'Queue should not be paused');

    // Wait for Ch 41 to finish
    await new Promise((resolve) => {
      const unsub = DownloadQueueService.subscribe((s) => {
        if (s.totalCount === 0 && !s.isProcessing) {
          unsub();
          resolve();
        }
      });
    });

    assert.strictEqual(downloadedTasks.length, 2, 'Both chapters completed after resume');
    assert.strictEqual(downloadedTasks[1].chapterNumber, 41, 'Ch 41 completed');
  });

  // 7. Clear All test
  await test('Clear All empties waiting queue and immediately aborts active task without starting next', async () => {
    downloadedTasks = [];
    startedTasks = [];
    DownloadQueueService.clearAll();
    mockDelayMs = 150;

    await DownloadQueueService.enqueue({ novelId: 'novel-f', chapterNumber: 50 });
    await DownloadQueueService.enqueue({ novelId: 'novel-f', chapterNumber: 51 });
    await DownloadQueueService.enqueue({ novelId: 'novel-f', chapterNumber: 52 });

    // Wait a brief tick so Ch 50 is actively downloading
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(startedTasks.length, 1, 'Ch 50 should have started');
    assert.strictEqual(startedTasks[0].chapterNumber, 50, 'Ch 50 was started');

    DownloadQueueService.clearAll();

    const state = DownloadQueueService.getState();
    assert.strictEqual(state.activeTask, null, 'Active task should be null');
    assert.strictEqual(state.queue.length, 0, 'Queue should be empty');
    assert.strictEqual(state.totalCount, 0, 'Total count should be 0');
    assert.strictEqual(state.isProcessing, false, 'Processing should be false');

    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.strictEqual(downloadedTasks.length, 0, 'No tasks should have completed');
    assert.strictEqual(startedTasks.length, 1, 'Subsequent chapters (51, 52) must NEVER be started or sent to API');
  });

  // 8. Rate limit backoff & head-of-queue retry on failure
  await test('Failure response triggers rate-limit backoff, halts downloads, and places chapter at head of queue', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });
    mockDelayMs = 20;
    mockFailChapter = 61; // Ch 61 will fail

    await DownloadQueueService.enqueue({ novelId: 'novel-g', chapterNumber: 60, options: { cooldown: false, translation: { enabled: false } } });
    await DownloadQueueService.enqueue({ novelId: 'novel-g', chapterNumber: 61, options: { cooldown: false, translation: { enabled: false } } }); // fails
    await DownloadQueueService.enqueue({ novelId: 'novel-g', chapterNumber: 62, options: { cooldown: false, translation: { enabled: false } } });

    // Wait until Ch 61 fails and enters retry cooldown
    await new Promise((resolve) => {
      const unsub = DownloadQueueService.subscribe((s) => {
        if (s.cooldown && s.cooldown.active && s.cooldown.type === 'retry') {
          unsub();
          resolve();
        }
      });
    });

    // Verify Ch 60 completed
    assert.strictEqual(downloadedTasks.length, 1, 'Only Ch 60 should be downloaded');
    assert.strictEqual(downloadedTasks[0].chapterNumber, 60, 'Ch 60 downloaded');

    // Verify Ch 61 is placed back at the head of the queue
    const state = DownloadQueueService.getState();
    assert.strictEqual(state.isProcessing, false, 'Queue must stop downloading subsequent chapters');
    assert(state.cooldown && state.cooldown.active, 'Cooldown must be active');
    assert.strictEqual(state.cooldown.type, 'retry', 'Cooldown type must be retry');
    assert.strictEqual(state.cooldown.totalSeconds, 4500, 'Error backoff must be 4500s (1h 15m)');
    assert.strictEqual(state.cooldown.nextChapterNumber, 61, 'Next chapter must be Ch 61');
    assert.strictEqual(state.queue.length, 2, 'Queue still has 2 chapters (61 at head, 62 waiting)');
    assert.strictEqual(state.queue[0].chapterNumber, 61, 'Ch 61 is back at the head of the queue');
    assert.strictEqual(state.queue[0].status, 'retry_pending', 'Ch 61 status is retry_pending');
    assert.strictEqual(state.queue[1].chapterNumber, 62, 'Ch 62 is next in queue');

    // Test manual skipFailedChapter: drops Ch 61 and proceeds with Ch 62
    DownloadQueueService.skipFailedChapter();

    await new Promise((resolve) => {
      const unsub = DownloadQueueService.subscribe((s) => {
        if (s.totalCount === 0 && !s.isProcessing && !s.cooldown) {
          unsub();
          resolve();
        }
      });
    });

    assert.strictEqual(downloadedTasks.length, 2, 'Ch 62 downloaded after skipping failed Ch 61');
    assert.strictEqual(downloadedTasks[1].chapterNumber, 62, 'Ch 62 downloaded');
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300 });
  });

  // 9. Cross-view persistence test
  await test('Cross-view persistence: storage persists activeTask and remaining queue so new views immediately display them', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    mockDelayMs = 80;
    mockFailChapter = null;

    // Enqueue 3 chapters
    await DownloadQueueService.enqueue({ novelId: 'novel-h', chapterNumber: 71 });
    await DownloadQueueService.enqueue({ novelId: 'novel-h', chapterNumber: 72 });
    await DownloadQueueService.enqueue({ novelId: 'novel-h', chapterNumber: 73 });

    // Verify storage has activeTask AND queue
    const saved = global.chrome.storage.local.data['quickconverter_download_queue'];
    assert(saved, 'Storage should contain queue data');
    assert(saved.activeTask, 'Storage MUST persist activeTask so new views see active downloading chapter');
    assert.strictEqual(saved.activeTask.chapterNumber, 71, 'Active chapter in storage is 71');
    assert.strictEqual(saved.queue.length, 2, 'Storage contains 2 waiting chapters');
    assert.strictEqual(saved.queue[0].chapterNumber, 72, 'Waiting chapter 1 is 72');
    assert.strictEqual(saved.queue[1].chapterNumber, 73, 'Waiting chapter 2 is 73');

    // Simulate opening a new view (e.g. reader.html) that queries storage
    let newViewReceivedState = null;
    global.chrome.storage.local.get(['quickconverter_download_queue'], (res) => {
      newViewReceivedState = res['quickconverter_download_queue'];
    });

    assert(newViewReceivedState, 'New view loads state from storage');
    assert.strictEqual(newViewReceivedState.activeTask.chapterNumber, 71, 'New view sees active chapter 71');
    assert.strictEqual(newViewReceivedState.queue.length, 2, 'New view sees 2 queued chapters');

    // Wait for all to finish
    await new Promise((resolve) => {
      const unsub = DownloadQueueService.subscribe((s) => {
        if (s.totalCount === 0 && !s.isProcessing) {
          unsub();
          resolve();
        }
      });
    });

    assert.strictEqual(downloadedTasks.length, 3, 'All 3 chapters downloaded sequentially across simulated view changes');
  });

  // 10. UI Client & Background Worker Enqueue Coexistence Test
  await test('UI Client and Background Worker: enqueuing Chapter B and C while A is downloading never drops activeTask A', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    mockDelayMs = 100;
    mockFailChapter = null;

    // Simulate background message router responding with authoritative state
    const originalSendMessage = global.chrome.runtime.sendMessage;
    global.chrome.runtime.sendMessage = function (msg, cb) {
      if (msg.action === 'QUEUE_ENQUEUE') {
        DownloadQueueService.enqueue(msg.task).then((res) => {
          if (cb) cb({ ...res, state: DownloadQueueService.getState() });
        });
        return;
      }
      if (msg.action === 'QUEUE_GET_STATE') {
        if (cb) cb(DownloadQueueService.getState());
        return;
      }
      if (cb) cb({ success: true, state: DownloadQueueService.getState() });
    };

    // Simulate UI client state
    let clientState = { activeTask: null, queue: [], isPaused: false, isProcessing: false };
    function updateClientFromResp(resp) {
      if (resp && resp.state) {
        clientState = resp.state;
      }
    }

    // Step 1: Client enqueues Chapter 80 (Task A)
    const resA = await new Promise((resolve) => {
      global.chrome.runtime.sendMessage({
        action: 'QUEUE_ENQUEUE',
        task: { id: 'novel-i_ch80', novelId: 'novel-i', chapterNumber: 80, chapterTitle: 'Ch 80', status: 'queued' }
      }, resolve);
    });
    updateClientFromResp(resA);

    assert(clientState.activeTask, 'Client must see activeTask Chapter 80 immediately');
    assert.strictEqual(clientState.activeTask.chapterNumber, 80);
    assert.strictEqual(clientState.queue.length, 0);

    // Step 2: Client enqueues Chapter 81 (Task B) while Chapter 80 is downloading
    const resB = await new Promise((resolve) => {
      global.chrome.runtime.sendMessage({
        action: 'QUEUE_ENQUEUE',
        task: { id: 'novel-i_ch81', novelId: 'novel-i', chapterNumber: 81, chapterTitle: 'Ch 81', status: 'queued' }
      }, resolve);
    });
    updateClientFromResp(resB);

    // CRITICAL: Active task Chapter 80 MUST NOT disappear or be null
    assert(clientState.activeTask, 'ActiveTask MUST NOT disappear when Chapter B is enqueued');
    assert.strictEqual(clientState.activeTask.chapterNumber, 80, 'ActiveTask must still be Chapter 80');
    assert.strictEqual(clientState.queue.length, 1, 'Queue must contain Chapter 81');
    assert.strictEqual(clientState.queue[0].chapterNumber, 81, 'Queue item 1 is Chapter 81');

    // Step 3: Client enqueues Chapter 82 (Task C)
    const resC = await new Promise((resolve) => {
      global.chrome.runtime.sendMessage({
        action: 'QUEUE_ENQUEUE',
        task: { id: 'novel-i_ch82', novelId: 'novel-i', chapterNumber: 82, chapterTitle: 'Ch 82', status: 'queued' }
      }, resolve);
    });
    updateClientFromResp(resC);

    assert(clientState.activeTask, 'ActiveTask must still be active');
    assert.strictEqual(clientState.activeTask.chapterNumber, 80, 'ActiveTask is Chapter 80');
    assert.strictEqual(clientState.queue.length, 2, 'Queue contains Chapters 81 and 82');
    assert.strictEqual(clientState.queue[0].chapterNumber, 81);
    assert.strictEqual(clientState.queue[1].chapterNumber, 82);

    // Wait for all 3 to finish
    await new Promise((resolve) => {
      const unsub = DownloadQueueService.subscribe((s) => {
        if (s.totalCount === 0 && !s.isProcessing) {
          unsub();
          resolve();
        }
      });
    });

    assert.strictEqual(downloadedTasks.length, 3);
    assert.strictEqual(downloadedTasks[0].chapterNumber, 80);
    assert.strictEqual(downloadedTasks[1].chapterNumber, 81);
    assert.strictEqual(downloadedTasks[2].chapterNumber, 82);

    // Restore sendMessage
    global.chrome.runtime.sendMessage = originalSendMessage;
  });

  // 11. Batch Enqueue test (enqueueBatch & QUEUE_ENQUEUE_BATCH)
  await test('enqueueBatch enqueues multiple chapters atomically, skips duplicates, and executes sequentially', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    mockDelayMs = 25;

    // Batch with 4 tasks, where one is a duplicate
    const tasks = [
      { novelId: 'novel-j', chapterNumber: 90, chapterTitle: 'Ch 90' },
      { novelId: 'novel-j', chapterNumber: 91, chapterTitle: 'Ch 91' },
      { novelId: 'novel-j', chapterNumber: 90, chapterTitle: 'Ch 90 Duplicate' },
      { novelId: 'novel-j', chapterNumber: 92, chapterTitle: 'Ch 92' }
    ];

    const res = await DownloadQueueService.enqueueBatch(tasks);
    assert.strictEqual(res.success, true, 'Batch enqueue should succeed');
    assert.strictEqual(res.count, 3, 'Should add 3 unique tasks, skipping duplicate 90');

    const state = DownloadQueueService.getState();
    assert(state.activeTask, 'One task should be active immediately');
    assert.strictEqual(state.activeTask.chapterNumber, 90, 'Ch 90 is active');
    assert.strictEqual(state.queue.length, 2, 'Ch 91 and Ch 92 are waiting');
    assert.strictEqual(state.queue[0].chapterNumber, 91);
    assert.strictEqual(state.queue[1].chapterNumber, 92);

    // Wait for all to finish
    await new Promise((resolve) => {
      const unsub = DownloadQueueService.subscribe((s) => {
        if (s.totalCount === 0 && !s.isProcessing) {
          unsub();
          resolve();
        }
      });
    });

    assert.strictEqual(downloadedTasks.length, 3, 'All 3 unique chapters downloaded');
    assert.strictEqual(downloadedTasks[0].chapterNumber, 90);
    assert.strictEqual(downloadedTasks[1].chapterNumber, 91);
    assert.strictEqual(downloadedTasks[2].chapterNumber, 92);
  });

  // 12. Streaming progress estimation and circular percentage test
  await test('Task progress updates with estimated percentage during streaming translation', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    mockDelayMs = 40;

    let receivedPercentages = [];
    const unsub = DownloadQueueService.subscribe((state) => {
      if (state.activeTask && state.activeTask.progress) {
        receivedPercentages.push(state.activeTask.progress.percent);
      }
    });

    await DownloadQueueService.enqueue({ novelId: 'novel-k', chapterNumber: 99 });

    await new Promise((resolve) => {
      const waitUnsub = DownloadQueueService.subscribe((s) => {
        if (s.totalCount === 0 && !s.isProcessing) {
          waitUnsub();
          resolve();
        }
      });
    });

    unsub();

    assert(receivedPercentages.length > 0, 'Should receive progress events with percent');
    assert(receivedPercentages.includes(45), 'Should have recorded 45% progress milestone');
    assert.strictEqual(downloadedTasks.length, 1, 'Chapter should be downloaded');
  });

  // 13. Standalone / Android WebView execution test (window & document defined, but no chrome.runtime.id)
  await test('Standalone/Android environment: executes tasks in-memory without background worker delegation', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    mockDelayMs = 20;

    // Simulate browser/WebView window and document existing
    global.window = { StorageService: mockStorageService };
    global.document = {};
    const originalChromeId = global.chrome?.runtime?.id;
    if (global.chrome && global.chrome.runtime) {
      delete global.chrome.runtime.id;
    }

    try {
      const res = await DownloadQueueService.enqueue({ novelId: 'novel-standalone', chapterNumber: 101 });
      assert(res.success, 'Enqueue should succeed in standalone environment');

      await new Promise((resolve) => {
        const waitUnsub = DownloadQueueService.subscribe((s) => {
          if (s.totalCount === 0 && !s.isProcessing) {
            waitUnsub();
            resolve();
          }
        });
      });

      assert.strictEqual(downloadedTasks.length, 1, 'Task should have executed directly in-memory');
      assert.strictEqual(downloadedTasks[0].novelId, 'novel-standalone');
      assert.strictEqual(downloadedTasks[0].chapterNumber, 101);
    } finally {
      // Clean up globals
      delete global.window;
      delete global.document;
      if (originalChromeId && global.chrome && global.chrome.runtime) {
        global.chrome.runtime.id = originalChromeId;
      }
    }
  });

  // 14. Rate limit cooldown test: verifies 3-5m delay mechanism, countdown ticking, skipCooldown, and cancellation
  await test('Rate limit cooldown: waits between chapters, ticks down, allows skipCooldown, and cancellation on clearAll', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    mockDelayMs = 20;

    // Enable cooldown with short test interval (1s min, 1s max)
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 1, maxSec: 1 });

    let cooldownStates = [];
    const unsub = DownloadQueueService.subscribe((state) => {
      if (state.cooldown && state.cooldown.active) {
        cooldownStates.push({ ...state.cooldown });
      }
    });

    await DownloadQueueService.enqueueBatch([
      { novelId: 'cooldown-novel', chapterNumber: 1 },
      { novelId: 'cooldown-novel', chapterNumber: 2 }
    ]);

    // Wait until Chapter 1 finishes and cooldown starts
    await new Promise((resolve) => {
      const checkUnsub = DownloadQueueService.subscribe((s) => {
        if (s.cooldown && s.cooldown.active) {
          checkUnsub();
          resolve();
        }
      });
    });

    assert.strictEqual(downloadedTasks.length, 1, 'Chapter 1 should be finished');
    assert.strictEqual(downloadedTasks[0].chapterNumber, 1);
    assert(cooldownStates.length > 0, 'Should have entered active cooldown state');
    assert.strictEqual(DownloadQueueService.cooldown.nextChapterNumber, 2);

    // Test skipCooldown()
    DownloadQueueService.skipCooldown();

    // Wait until Chapter 2 finishes
    await new Promise((resolve) => {
      const waitDone = DownloadQueueService.subscribe((s) => {
        if (s.totalCount === 0 && !s.isProcessing && !s.cooldown) {
          waitDone();
          resolve();
        }
      });
    });

    unsub();
    assert.strictEqual(downloadedTasks.length, 2, 'Chapter 2 should be downloaded after skipping cooldown');
    assert.strictEqual(downloadedTasks[1].chapterNumber, 2);

    // Test cancellation on clearAll during cooldown
    downloadedTasks = [];
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 50, maxSec: 50 });
    await DownloadQueueService.enqueueBatch([
      { novelId: 'cooldown-cancel', chapterNumber: 1 },
      { novelId: 'cooldown-cancel', chapterNumber: 2 }
    ]);

    await new Promise((resolve) => {
      const checkUnsub = DownloadQueueService.subscribe((s) => {
        if (s.cooldown && s.cooldown.active) {
          checkUnsub();
          resolve();
        }
      });
    });

    assert(DownloadQueueService.cooldown && DownloadQueueService.cooldown.active);
    DownloadQueueService.clearAll();
    assert.strictEqual(DownloadQueueService.cooldown, null, 'Cooldown should be aborted on clearAll');
    assert.strictEqual(DownloadQueueService.queue.length, 0, 'Queue should be empty');

    // Reset cooldown to false for safety
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300 });
  });

  // 15. The rate limit cooldown paces every download (owner decision): raw downloads and translations both wait when it is on
  await test('Rate limit cooldown applies to every download: raw downloads and translations wait between chapters; off means no wait', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    mockDelayMs = 20;

    // Enable cooldown globally with 1s duration
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 1, maxSec: 1 });

    // A. Enqueue 2 raw chapters without translation (options.translation.enabled: false)
    await DownloadQueueService.enqueueBatch([
      {
        novelId: 'raw-novel',
        chapterNumber: 1,
        options: { translation: { enabled: false } }
      },
      {
        novelId: 'raw-novel',
        chapterNumber: 2,
        options: { translation: { enabled: false } }
      }
    ]);

    // Raw chapter 1 finishes, then the queue waits before chapter 2
    await new Promise((resolve) => {
      const checkUnsub = DownloadQueueService.subscribe((s) => {
        if (s.cooldown && s.cooldown.active) {
          checkUnsub();
          resolve();
        }
      });
    });
    assert.strictEqual(downloadedTasks.length, 1, 'Raw chapter 1 finished');
    assert(DownloadQueueService.cooldown && DownloadQueueService.cooldown.active, 'A raw download waits between chapters when the cooldown is on');
    assert.strictEqual(DownloadQueueService.cooldown.nextChapterNumber, 2);
    DownloadQueueService.skipCooldown();
    await new Promise((resolve) => {
      const waitDone = DownloadQueueService.subscribe((s) => {
        if (s.totalCount === 0 && !s.isProcessing && !s.cooldown) {
          waitDone();
          resolve();
        }
      });
    });
    assert.strictEqual(downloadedTasks.length, 2, 'Both raw chapters complete');

    // A2. With the cooldown turned off (the panel sends cooldown: false), raw downloads go straight on
    downloadedTasks = [];
    await DownloadQueueService.enqueueBatch([
      { novelId: 'raw-novel', chapterNumber: 3, options: { cooldown: false, translation: { enabled: false, cooldown: false } } },
      { novelId: 'raw-novel', chapterNumber: 4, options: { cooldown: false, translation: { enabled: false, cooldown: false } } }
    ]);
    let waited = false;
    await new Promise((resolve) => {
      const waitDone = DownloadQueueService.subscribe((s) => {
        if (s.cooldown && s.cooldown.active) waited = true;
        if (s.totalCount === 0 && !s.isProcessing && !s.cooldown) {
          waitDone();
          resolve();
        }
      });
    });
    assert.strictEqual(downloadedTasks.length, 2, 'Both chapters complete');
    assert.strictEqual(waited, false, 'No wait when the cooldown is off');

    // B. Enqueue 2 translated chapters with cooldown enabled
    downloadedTasks = [];
    await DownloadQueueService.enqueueBatch([
      {
        novelId: 'trans-novel',
        chapterNumber: 10,
        options: { translation: { enabled: true, cooldown: true } }
      },
      {
        novelId: 'trans-novel',
        chapterNumber: 11,
        options: { translation: { enabled: true, cooldown: true } }
      }
    ]);

    // Wait for Chapter 10 to finish and verify cooldown triggers
    await new Promise((resolve) => {
      const checkUnsub = DownloadQueueService.subscribe((s) => {
        if (s.cooldown && s.cooldown.active) {
          checkUnsub();
          resolve();
        }
      });
    });

    assert.strictEqual(downloadedTasks.length, 1, 'Chapter 10 finished');
    assert(DownloadQueueService.cooldown && DownloadQueueService.cooldown.active, 'Translated chapter must trigger cooldown');
    assert.strictEqual(DownloadQueueService.cooldown.nextChapterNumber, 11);

    // Skip cooldown and let Chapter 11 finish
    DownloadQueueService.skipCooldown();

    await new Promise((resolve) => {
      const waitDone = DownloadQueueService.subscribe((s) => {
        if (s.totalCount === 0 && !s.isProcessing && !s.cooldown) {
          waitDone();
          resolve();
        }
      });
    });

    assert.strictEqual(downloadedTasks.length, 2, 'Chapter 11 finished after skip');

    // Reset cooldown
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300 });
  });

  // 16. Proportional 25% minimum delta test: verifies consecutive cooldown durations differ by at least 25% of span
  await test('25% minimum delta between consecutive cooldowns without rounding or bucketing', async () => {
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 100, maxSec: 200 });
    const span = 200 - 100;
    const expectedDelta = Math.round(span * 0.25); // 25s

    let prev = null;
    for (let i = 0; i < 50; i++) {
      DownloadQueueService.queue = [{ id: 'dummy', chapterNumber: i + 1 }];
      DownloadQueueService._startCooldown();
      const current = DownloadQueueService.cooldown.totalSeconds;
      assert(current >= 100 && current <= 200, `Current duration ${current} must be in [100, 200]`);
      if (prev !== null) {
        const diff = Math.abs(current - prev);
        assert(diff >= expectedDelta, `Consecutive durations ${prev} and ${current} must differ by >= ${expectedDelta}s (was ${diff}s)`);
      }
      prev = current;
      DownloadQueueService._clearCooldownTimers();
      DownloadQueueService.cooldown = null;
    }

    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300 });
  });

  // 17. Manual override controls test: retryNow immediately retries head chapter during 1h 15m backoff
  await test('retryNow immediately retries head chapter during rate-limit backoff', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });
    mockDelayMs = 20;
    mockFailChapter = 80;

    await DownloadQueueService.enqueue({ novelId: 'novel-retry', chapterNumber: 80, options: { translation: { enabled: false } } });

    // Wait for failure and retry cooldown
    await new Promise((resolve) => {
      const unsub = DownloadQueueService.subscribe((s) => {
        if (s.cooldown && s.cooldown.active && s.cooldown.type === 'retry') {
          unsub();
          resolve();
        }
      });
    });

    assert.strictEqual(DownloadQueueService.cooldown.type, 'retry');
    assert.strictEqual(DownloadQueueService.queue[0].chapterNumber, 80);

    // Clear failure condition and trigger retryNow
    mockFailChapter = null;
    DownloadQueueService.retryNow();

    await new Promise((resolve) => {
      const unsub = DownloadQueueService.subscribe((s) => {
        if (s.totalCount === 0 && !s.isProcessing && !s.cooldown) {
          unsub();
          resolve();
        }
      });
    });

    assert.strictEqual(downloadedTasks.length, 1, 'Ch 80 downloaded successfully upon retryNow');
    assert.strictEqual(downloadedTasks[0].chapterNumber, 80);
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300 });
  });

  // 18. Permanent error circuit breaker: 401/402 errors pause queue immediately without running 75m timer
  await test('Permanent auth or balance error pauses queue immediately without 75m backoff timer', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });

    // Mock storage to throw 401 Invalid API Key
    const originalDownload = mockStorageService.downloadChapter;
    mockStorageService.downloadChapter = async () => {
      throw new Error('Invalid API key. Please check your key. (401)');
    };

    await DownloadQueueService.enqueue({ novelId: 'novel-auth', chapterNumber: 90 });

    await new Promise((resolve) => {
      let unsub;
      unsub = DownloadQueueService.subscribe((s) => {
        if (s.isPaused) {
          if (unsub) unsub();
          else setTimeout(() => unsub && unsub(), 0);
          resolve();
        }
      });
    });

    const state = DownloadQueueService.getState();
    assert.strictEqual(state.isPaused, true, 'Queue must pause immediately on 401/402');
    assert.strictEqual(state.cooldown, null, 'No 75-minute cooldown timer should run for auth errors');
    assert.strictEqual(state.queue.length, 1, 'Chapter remains at head of queue');
    assert.strictEqual(state.queue[0].status, 'paused_error', 'Chapter status is paused_error');

    // Restore mock
    mockStorageService.downloadChapter = originalDownload;
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300 });
  });

  // 19. Max retries circuit breaker: after exceeding maxRetries, chapter is marked failed and queue paused
  await test('Exceeding maxRetries marks chapter permanently failed and pauses queue', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 2 });
    mockFailChapter = 99; // Always fails

    await DownloadQueueService.enqueue({ novelId: 'novel-loop', chapterNumber: 99 });

    // Attempt 1 fails -> retry_pending (retryCount: 1)
    await new Promise((r) => {
      let unsub;
      unsub = DownloadQueueService.subscribe((s) => {
        if (s.cooldown && s.cooldown.active) {
          if (unsub) unsub();
          else setTimeout(() => unsub && unsub(), 0);
          r();
        }
      });
    });
    assert.strictEqual(DownloadQueueService.queue[0].retryCount, 1);

    // Trigger retry 1
    DownloadQueueService.retryNow();

    // Attempt 2 fails -> retry_pending (retryCount: 2)
    await new Promise((r) => {
      let unsub;
      unsub = DownloadQueueService.subscribe((s) => {
        if (s.cooldown && s.cooldown.active) {
          if (unsub) unsub();
          else setTimeout(() => unsub && unsub(), 0);
          r();
        }
      });
    });
    assert.strictEqual(DownloadQueueService.queue[0].retryCount, 2);

    // Trigger retry 2
    DownloadQueueService.retryNow();

    // Attempt 3 fails -> exceeds maxRetries (2) -> queue paused, cooldown null
    await new Promise((r) => {
      let unsub;
      unsub = DownloadQueueService.subscribe((s) => {
        if (s.isPaused) {
          if (unsub) unsub();
          else setTimeout(() => unsub && unsub(), 0);
          r();
        }
      });
    });

    const state = DownloadQueueService.getState();
    assert.strictEqual(state.isPaused, true, 'Queue is paused after exceeding max retries');
    assert.strictEqual(state.cooldown, null, 'Cooldown is cleared');
    assert.strictEqual(state.queue.length, 0, 'Permanently failed chapter is not re-queued');

    mockFailChapter = null;
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });
  });

  // 20. Model-requested <<<DELAY>>> overrides the toggle and waits exactly N + 5 seconds
  await test('translationDelay forces an exact N+5s cooldown even when cooldown is disabled', async () => {
    downloadedTasks = [];
    mockFailChapter = null;
    mockDelayMs = 10;
    mockTranslationDelay = 7;
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300 });

    await DownloadQueueService.enqueue({ novelId: 'novel-delay', chapterNumber: 1 });
    await DownloadQueueService.enqueue({ novelId: 'novel-delay', chapterNumber: 2 });

    await new Promise((resolve) => {
      const unsub = DownloadQueueService.subscribe((s) => {
        if (s.cooldown && s.cooldown.active) {
          unsub();
          resolve();
        }
      });
    });

    assert.strictEqual(DownloadQueueService.cooldown.type, 'normal', 'delay uses a normal (skippable) cooldown');
    assert.strictEqual(DownloadQueueService.cooldown.totalSeconds, 12, 'waits delay + 5 seconds exactly');
    assert.strictEqual(DownloadQueueService.cooldown.nextChapterNumber, 2, 'next chapter is queued behind the wait');

    mockTranslationDelay = 0;
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300 });
  });

  // 21. Timeout / no-response failure pauses the queue, keeps the chapter, and surfaces the error
  await test('timeout error pauses the queue with the error and no retry backoff', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });

    const originalDownload = mockStorageService.downloadChapter;
    mockStorageService.downloadChapter = async () => {
      throw new Error('Translation timed out: no data received for 60 seconds.');
    };

    await DownloadQueueService.enqueue({ novelId: 'novel-timeout', chapterNumber: 42 });

    await new Promise((resolve) => {
      let unsub;
      unsub = DownloadQueueService.subscribe((s) => {
        if (s.isPaused) {
          if (unsub) unsub(); else setTimeout(() => unsub && unsub(), 0);
          resolve();
        }
      });
    });

    const state = DownloadQueueService.getState();
    assert.strictEqual(state.isPaused, true, 'queue pauses on timeout');
    assert.strictEqual(state.cooldown, null, 'timeouts do NOT start the retry backoff');
    assert.strictEqual(state.queue.length, 1, 'timed-out chapter stays in the queue');
    assert.strictEqual(state.queue[0].status, 'paused_error', 'chapter is parked as paused_error at the head');
    assert(state.pauseError && state.pauseError.includes('timed out'), 'pauseError carries the timeout message');

    mockStorageService.downloadChapter = originalDownload;
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });
  });

  // 21f. Phase 1 of several queues: the service holds lanes; for now there is one, "main",
  // and the state lists it next to the top-level fields every view reads today
  await test('the queue service lists its one lane, "main", with the same state as the top level', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });
    const originalDownload = mockStorageService.downloadChapter;
    let release;
    mockStorageService.downloadChapter = () => new Promise((resolve) => { release = () => resolve({ id: 'x' }); });

    await DownloadQueueService.enqueue({ novelId: 'lane-novel', novelTitle: 'Lane Novel', chapterNumber: 1 });
    await DownloadQueueService.enqueue({ novelId: 'lane-novel', novelTitle: 'Lane Novel', chapterNumber: 2 });
    await new Promise((r) => setTimeout(r, 20));

    const state = DownloadQueueService.getState();
    assert(Array.isArray(state.lanes) && state.lanes.length === 1, 'one lane');
    const [lane] = state.lanes;
    assert.strictEqual(lane.id, 'main');
    for (const field of ['activeTask', 'queue', 'isPaused', 'isProcessing', 'cooldown', 'pauseError', 'skipped', 'totalCount']) {
      assert.deepStrictEqual(JSON.parse(JSON.stringify(lane[field] === undefined ? null : lane[field])), JSON.parse(JSON.stringify(state[field] === undefined ? null : state[field])), `lane ${field} matches the top level`);
    }
    assert.strictEqual(state.activeTask.laneId, 'main', 'the active chapter records its lane');
    assert.strictEqual(state.queue[0].laneId, 'main', 'waiting chapters record their lane');

    const seen = [];
    const unsub = DownloadQueueService.subscribe((s) => seen.push(s));
    unsub();
    assert(seen.length > 0 && Array.isArray(seen[0].lanes) && seen[0].lanes[0].id === 'main', 'subscribers get the lanes too');

    release();
    mockStorageService.downloadChapter = originalDownload;
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });
  });

  // 21c. A chapter the site cannot give (VIP, missing) is skipped and the queue goes on
  await test('a chapter the site cannot give is skipped, listed with its reason, and the queue goes on', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });

    const originalDownload = mockStorageService.downloadChapter;
    const asked = [];
    mockStorageService.downloadChapter = async (novelId, chapterNumber) => {
      asked.push(chapterNumber);
      if (chapterNumber === 60) {
        const error = new Error('VIP chapter the site cannot load: Đây là chương vip của qidian, chưa thể tải chương này.');
        error.outcome = 'skip';
        throw error;
      }
      return { id: `${novelId}_ch${chapterNumber}` };
    };

    await DownloadQueueService.enqueue({ novelId: 'novel-stv', chapterNumber: 60, chapterTitle: 'Chương 60' });
    await DownloadQueueService.enqueue({ novelId: 'novel-stv', chapterNumber: 61, chapterTitle: 'Chương 61' });
    for (let i = 0; i < 50 && asked.length < 2; i++) await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 20));

    const state = DownloadQueueService.getState();
    assert.deepStrictEqual(asked, [60, 61], 'the next chapter is downloaded right after');
    assert.strictEqual(state.isPaused, false, 'the queue does not pause');
    assert.strictEqual(state.pauseError, null);
    assert.strictEqual(state.cooldown, null, 'no retry backoff');
    assert.strictEqual(state.skipped.length, 1, 'the skipped chapter is listed');
    assert.strictEqual(state.skipped[0].chapterNumber, 60);
    assert.strictEqual(state.skipped[0].novelId, 'novel-stv');
    assert(/VIP/.test(state.skipped[0].reason), 'with why');

    DownloadQueueService.clearSkipped();
    assert.deepStrictEqual(DownloadQueueService.getState().skipped, [], 'Dismiss empties the list');
    DownloadQueueService.skipped = [{ novelId: 'novel-stv', chapterNumber: 60, reason: 'VIP' }];
    DownloadQueueService.clearAll();
    assert.deepStrictEqual(DownloadQueueService.getState().skipped, [], 'Clear all empties the list');
    mockStorageService.downloadChapter = originalDownload;
  });

  // 21e. A page that timed out (outcome retry) is retried shortly, never pauses the queue,
  // even though its message says "timed out"; after a few quick tries the normal backoff applies
  await test('a page timeout is retried after 30 s up to 3 times without pausing, then falls back to the normal backoff', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });

    const originalDownload = mockStorageService.downloadChapter;
    let attempts = 0;
    mockStorageService.downloadChapter = async () => {
      attempts++;
      const error = new Error('Sáng Tác Việt timed out loading the chapter.');
      error.outcome = 'retry';
      throw error;
    };
    const waitForRetry = () => {
      const attemptsBefore = attempts;
      let done = false;
      return new Promise((resolve) => {
        const unsub = DownloadQueueService.subscribe((s) => {
          if (done) return;
          if (s.cooldown && s.cooldown.active && s.cooldown.type === 'retry' && attempts > attemptsBefore) {
            done = true;
            setTimeout(() => unsub(), 0);
            resolve(s);
          }
        });
      });
    };

    let next = waitForRetry();
    await DownloadQueueService.enqueue({ novelId: 'novel-stv', chapterNumber: 241, chapterTitle: 'Thứ 241 chương' });
    let state = await next;
    assert.strictEqual(state.isPaused, false, 'a page timeout does not pause the queue');
    assert.strictEqual(state.pauseError, null);
    assert.strictEqual(state.cooldown.totalSeconds, 30, 'it is retried after 30 s, not 1 h 15 min');
    assert.strictEqual(state.queue[0].chapterNumber, 241, 'the chapter waits at the head');

    for (let quick = 2; quick <= 3; quick++) {
      next = waitForRetry();
      DownloadQueueService.retryNow();
      state = await next;
      assert.strictEqual(state.cooldown.totalSeconds, 30, `quick retry ${quick}`);
    }
    next = waitForRetry();
    DownloadQueueService.retryNow();
    state = await next;
    assert.strictEqual(attempts, 4);
    assert.strictEqual(state.isPaused, false, 'still no pause');
    assert.strictEqual(state.cooldown.totalSeconds, 4500, 'after 3 quick retries the normal backoff applies');

    mockStorageService.downloadChapter = originalDownload;
    DownloadQueueService.clearAll();
  });

  // 21d. The site refusing this browser pauses the queue (every chapter would fail the same way)
  await test('the site refusing this browser pauses the queue without spending retries', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });

    const originalDownload = mockStorageService.downloadChapter;
    mockStorageService.downloadChapter = async () => {
      const error = new Error('Sáng Tác Việt refused to load chapters in this browser (error 4005).');
      error.outcome = 'blocked';
      throw error;
    };

    await DownloadQueueService.enqueue({ novelId: 'novel-stv', chapterNumber: 1 });
    await new Promise((resolve) => {
      let unsub;
      unsub = DownloadQueueService.subscribe((s) => {
        if (s.isPaused) {
          if (unsub) unsub(); else setTimeout(() => unsub && unsub(), 0);
          resolve();
        }
      });
    });

    const state = DownloadQueueService.getState();
    assert.strictEqual(state.isPaused, true);
    assert.strictEqual(state.cooldown, null, 'no retry backoff');
    assert.strictEqual(state.queue[0].status, 'paused_error', 'the chapter waits at the head');
    assert(!state.queue[0].retryCount, 'retry budget is not consumed');
    assert(state.pauseError.includes('4005'));

    mockStorageService.downloadChapter = originalDownload;
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });
  });

  // 21b. Page sites where pages cannot be opened pause instead of backing off
  await test('a page site without a page source pauses the queue with the reason and no retry backoff', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });

    const originalDownload = mockStorageService.downloadChapter;
    mockStorageService.downloadChapter = async () => {
      throw new Error('独阅读: chapters are saved by opening its page.');
    };

    await DownloadQueueService.enqueue({ novelId: 'novel-manual', chapterNumber: 7 });

    await new Promise((resolve) => {
      let unsub;
      unsub = DownloadQueueService.subscribe((s) => {
        if (s.isPaused) {
          if (unsub) unsub(); else setTimeout(() => unsub && unsub(), 0);
          resolve();
        }
      });
    });

    const state = DownloadQueueService.getState();
    assert.strictEqual(state.isPaused, true, 'queue pauses');
    assert.strictEqual(state.cooldown, null, 'no retry backoff is started');
    assert.strictEqual(state.queue[0].status, 'paused_error', 'chapter is parked as paused_error at the head');
    assert(!state.queue[0].retryCount, 'retry budget is not consumed');
    assert(state.pauseError && state.pauseError.includes('saved by opening its page'), 'pauseError explains why');

    mockStorageService.downloadChapter = originalDownload;
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });
  });

  // 22. 429 rate limit keeps the old backoff behavior and is flagged as a rate limit
  await test('429 rate-limit error starts the retry backoff flagged rateLimit', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });

    const originalDownload = mockStorageService.downloadChapter;
    mockStorageService.downloadChapter = async () => {
      throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
    };

    await DownloadQueueService.enqueue({ novelId: 'novel-429', chapterNumber: 43 });

    await new Promise((resolve) => {
      const unsub = DownloadQueueService.subscribe((s) => {
        if (s.cooldown && s.cooldown.active) {
          unsub();
          resolve();
        }
      });
    });

    assert.strictEqual(DownloadQueueService.cooldown.type, 'retry', 'rate limit uses the retry backoff');
    assert.strictEqual(DownloadQueueService.cooldown.rateLimit, true, 'backoff is flagged as a rate limit');
    assert.strictEqual(DownloadQueueService.queue[0].status, 'retry_pending', 'chapter waits at the head for retry');
    assert.strictEqual(DownloadQueueService.getState().pauseError, null, 'rate limit does not pause the queue');

    mockStorageService.downloadChapter = originalDownload;
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });
  });

  await test('A chapter whose page needs the user shows "waiting for you", then finishes normally', async () => {
    DownloadQueueService.clearAll();
    DownloadQueueService.resume();
    const originalDownload = mockStorageService.downloadChapter;
    let release = null;
    mockStorageService.downloadChapter = async (novelId, chNum, options) => {
      options.onNeedsUser('Log in to 独阅读');
      await new Promise((resolve) => { release = resolve; });
      return { success: true, translationDelay: 0 };
    };
    try {
      await DownloadQueueService.enqueue({ novelId: 'n-page', novelTitle: '门户', chapterNumber: 301, chapterTitle: 'Chapter 301' });
      await new Promise((r) => setTimeout(r, 20));
      const waiting = DownloadQueueService.getState();
      assert.strictEqual(waiting.activeTask.progress.phase, 'needs-user');
      assert.strictEqual(waiting.activeTask.progress.text, 'Log in to 独阅读');
      assert.strictEqual(DownloadQueueService.backgroundWorkText(waiting), 'Waiting for you: Log in to 独阅读 · Chapter 301');
      release();
      await new Promise((resolve) => {
        const stop = DownloadQueueService.subscribe((s) => { if (s.totalCount === 0 && !s.isProcessing) { stop(); resolve(); } });
      });
      assert.strictEqual(DownloadQueueService.getState().isPaused, false, 'carries on');
    } finally {
      mockStorageService.downloadChapter = originalDownload;
      DownloadQueueService.clearAll();
    }
  });

  await test('Closing the page before the chapter loads pauses the queue with the reason, no retry backoff', async () => {
    DownloadQueueService.clearAll();
    DownloadQueueService.resume();
    const originalDownload = mockStorageService.downloadChapter;
    mockStorageService.downloadChapter = async () => { throw new Error('Closed before the chapter loaded.'); };
    try {
      await DownloadQueueService.enqueue({ novelId: 'n-page', novelTitle: '门户', chapterNumber: 302, chapterTitle: 'Chapter 302' });
      await new Promise((r) => setTimeout(r, 30));
      const state = DownloadQueueService.getState();
      assert.strictEqual(state.isPaused, true);
      assert.strictEqual(state.pauseError, 'Closed before the chapter loaded.');
      assert.strictEqual(state.cooldown, null, 'no 75-minute backoff');
      assert.strictEqual(state.queue[0].chapterNumber, 302, 'the chapter stays first in line');
    } finally {
      mockStorageService.downloadChapter = originalDownload;
      DownloadQueueService.clearAll();
      DownloadQueueService.resume();
    }
  });

  await test('backgroundWorkText says what keeps the app working, and nothing when it can rest', () => {
    const text = DownloadQueueService.backgroundWorkText;
    const task = (n) => ({ novelTitle: 'Regressor', chapterNumber: n, chapterTitle: `Chapter ${n}` });
    assert.strictEqual(text({ activeTask: task(7), queue: [], isPaused: false, cooldown: null }), 'Downloading Regressor · Chapter 7');
    assert.strictEqual(text({ activeTask: task(7), queue: [task(8), task(9)], isPaused: false, cooldown: null }), 'Downloading Regressor · Chapter 7 · 2 more queued');
    assert.strictEqual(
      text({ activeTask: null, queue: [task(8)], isPaused: false, cooldown: { active: true, type: 'normal', nextNovelTitle: 'Regressor', nextChapterTitle: 'Chapter 8' } }),
      'Waiting before Regressor · Chapter 8 · 1 queued'
    );
    assert.strictEqual(text({ activeTask: null, queue: [task(8)], isPaused: false, cooldown: { active: true, type: 'retry' } }), null, 'a 75-minute error backoff does not keep the phone awake');
    assert.strictEqual(text({ activeTask: null, queue: [task(8)], isPaused: true, cooldown: null }), null, 'paused');
    assert.strictEqual(text({ activeTask: null, queue: [], isPaused: false, cooldown: null }), null, 'nothing to do');
  });

  await test('In the app, the queue holds the app awake while it works and lets go when done or failing', async () => {
    const calls = [];
    const realPlatform = require('../src/services/platform.js');
    global.Platform = {
      storage: { area: () => null, onChanged: () => () => {} },
      messaging: realPlatform.messaging,
      alarms: { isNative: () => false },
      runtime: { isExtension: () => false, ping() {} },
      background: {
        hold: async (text) => { calls.push(['hold', text]); },
        release: async () => { calls.push(['release']); }
      }
    };
    const pageListeners = {};
    global.window = { StorageService: mockStorageService, addEventListener: (type, fn) => { pageListeners[type] = fn; } };
    global.document = {};
    try {
      DownloadQueueService.clearAll();
      calls.length = 0;
      mockDelayMs = 20;
      mockFailChapter = null;
      await DownloadQueueService.enqueueBatch([
        { novelId: 'n-bg', novelTitle: 'Regressor', chapterNumber: 201, chapterTitle: 'Chapter 201' },
        { novelId: 'n-bg', novelTitle: 'Regressor', chapterNumber: 202, chapterTitle: 'Chapter 202' }
      ]);
      await new Promise((resolve) => {
        const stop = DownloadQueueService.subscribe((s) => { if (s.totalCount === 0 && !s.isProcessing) { stop(); resolve(); } });
      });
      await new Promise((r) => setTimeout(r, 10));
      const holds = calls.filter((c) => c[0] === 'hold').map((c) => c[1]);
      assert(holds.includes('Downloading Regressor · Chapter 201 · 1 more queued'), JSON.stringify(calls));
      assert(holds.includes('Downloading Regressor · Chapter 202'), JSON.stringify(calls));
      assert.deepStrictEqual(calls[calls.length - 1], ['release'], 'lets go once the queue is empty');
      for (let i = 1; i < calls.length; i++) {
        assert.notDeepStrictEqual(calls[i], calls[i - 1], 'never repeats the same call');
      }

      calls.length = 0;
      DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });
      mockFailChapter = 203;
      await DownloadQueueService.enqueue({ novelId: 'n-bg', novelTitle: 'Regressor', chapterNumber: 203, chapterTitle: 'Chapter 203' });
      await new Promise((resolve) => {
        const stop = DownloadQueueService.subscribe((s) => { if (s.cooldown && s.cooldown.active && s.cooldown.type === 'retry') { stop(); resolve(); } });
      });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(calls[calls.length - 1], ['release'], 'a failed chapter waiting 75 minutes lets the phone rest');

      calls.length = 0;
      mockFailChapter = null;
      DownloadQueueService.clearAll();
      mockDelayMs = 200;
      await DownloadQueueService.enqueue({ novelId: 'n-bg', novelTitle: 'Regressor', chapterNumber: 204, chapterTitle: 'Chapter 204' });
      await new Promise((r) => setTimeout(r, 30));
      assert.strictEqual(calls[calls.length - 1][0], 'hold');
      assert.strictEqual(typeof pageListeners.pagehide, 'function', 'watches for the page going away');
      pageListeners.pagehide();
      assert.deepStrictEqual(calls[calls.length - 1], ['release'], 'leaving the page lets go; the next page holds again if it resumes the queue');
    } finally {
      mockFailChapter = null;
      DownloadQueueService.clearAll();
      delete global.Platform;
      delete global.window;
      delete global.document;
    }
  });

  // --- Phase 2 of several queues: lanes run in parallel ---
  const waitUntil = async (check, label, ms = 3000) => {
    const start = Date.now();
    while (!check()) {
      if (Date.now() - start > ms) throw new Error(`timed out waiting: ${label}`);
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  const laneOf = (novelId) => DownloadQueueService.getState().lanes.find((l) => (l.activeTask && l.activeTask.novelId === novelId) || l.queue.some((t) => t.novelId === novelId));
  const gate = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open }; };
  const RAW = { translation: { enabled: false } };

  await test('a novel that already has a lane keeps adding to it; "new" starts a second lane that runs in parallel', async () => {
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });
    const original = mockStorageService.downloadChapter;
    const running = new Set();
    const gates = {};
    mockStorageService.downloadChapter = async (novelId, n) => {
      running.add(`${novelId}:${n}`);
      gates[`${novelId}:${n}`] = gate();
      await gates[`${novelId}:${n}`].p;
      running.delete(`${novelId}:${n}`);
      return { id: `${novelId}_ch${n}` };
    };
    try {
      await DownloadQueueService.enqueue({ novelId: 'lane-a', novelTitle: 'A', chapterNumber: 1, options: RAW });
      await DownloadQueueService.enqueue({ novelId: 'lane-a', novelTitle: 'A', chapterNumber: 2, options: RAW }, { lane: 'new' });
      assert.strictEqual(DownloadQueueService.getState().lanes.length, 1, 'chapters of a novel that has a lane always join it');
      await DownloadQueueService.enqueueBatch([{ novelId: 'lane-b', novelTitle: 'B', chapterNumber: 1, options: RAW }], { lane: 'new' });
      const state = DownloadQueueService.getState();
      assert.strictEqual(state.lanes.length, 2, 'a second lane');
      assert.notStrictEqual(laneOf('lane-a').id, laneOf('lane-b').id);
      await waitUntil(() => running.has('lane-a:1') && running.has('lane-b:1'), 'both lanes download at the same time');
      assert.strictEqual(DownloadQueueService.getState().totalCount, 3, 'the summary counts every lane');
      assert.deepStrictEqual(JSON.parse(JSON.stringify(DownloadQueueService.getChapterStatus('lane-b', 1))).status, 'processing', 'chapter status looks across lanes');
      assert.strictEqual(DownloadQueueService.isQueued('lane-a', 2), true);
      gates['lane-b:1'].open();
      await waitUntil(() => DownloadQueueService.getState().lanes.length === 1, 'a lane with nothing left is removed');
      gates['lane-a:1'].open();
      await waitUntil(() => running.has('lane-a:2'), 'lane A goes on');
      gates['lane-a:2'].open();
      await waitUntil(() => DownloadQueueService.getState().lanes.length === 0, 'no lanes when everything is done');
    } finally {
      mockStorageService.downloadChapter = original;
      DownloadQueueService.clearAll();
    }
  });

  await test('"auto" joins the only lane, and starts a new one when several other lanes are busy', async () => {
    DownloadQueueService.clearAll();
    const original = mockStorageService.downloadChapter;
    const hold = gate();
    mockStorageService.downloadChapter = async () => { await hold.p; return {}; };
    try {
      await DownloadQueueService.enqueue({ novelId: 'auto-a', chapterNumber: 1, options: RAW });
      await DownloadQueueService.enqueue({ novelId: 'auto-b', chapterNumber: 1, options: RAW });
      assert.strictEqual(DownloadQueueService.getState().lanes.length, 1, 'with one lane, auto joins it');
      await DownloadQueueService.enqueue({ novelId: 'auto-c', chapterNumber: 1, options: RAW }, { lane: 'new' });
      await DownloadQueueService.enqueue({ novelId: 'auto-d', chapterNumber: 1, options: RAW });
      assert.strictEqual(DownloadQueueService.getState().lanes.length, 3, 'with several busy lanes, auto starts a new one');
      const target = laneOf('auto-c').id;
      await DownloadQueueService.enqueue({ novelId: 'auto-e', chapterNumber: 1, options: RAW }, { lane: target });
      assert.strictEqual(laneOf('auto-e').id, target, 'a chosen lane is used');
    } finally {
      hold.open();
      mockStorageService.downloadChapter = original;
      DownloadQueueService.clearAll();
    }
  });

  await test('lanes on the same site take turns at fetching; different sites do not wait', async () => {
    DownloadQueueService.clearAll();
    const original = mockStorageService.downloadChapter;
    const order = [];
    mockStorageService.downloadChapter = async (novelId, n, options) => {
      const site = novelId.startsWith('stv') ? 'sangtacviet' : 'wetriedtls';
      const release = await options.siteTurn(site);
      order.push(`${novelId}:${n}`);
      await new Promise((r) => setTimeout(r, 15));
      release();
      return {};
    };
    try {
      await DownloadQueueService.enqueueBatch([1, 2, 3].map((n) => ({ novelId: 'stv-1', chapterNumber: n, options: RAW })));
      await DownloadQueueService.enqueueBatch([1, 2, 3].map((n) => ({ novelId: 'stv-2', chapterNumber: n, options: RAW })), { lane: 'new' });
      await waitUntil(() => order.length === 6, 'all six fetched');
      const sites = order.map((k) => k.split(':')[0]);
      for (let i = 1; i < sites.length; i++) assert.notStrictEqual(sites[i], sites[i - 1], `same-site lanes alternate: ${order.join(', ')}`);

      order.length = 0;
      const held = gate();
      mockStorageService.downloadChapter = async (novelId, n, options) => {
        const release = await options.siteTurn(novelId.startsWith('stv') ? 'sangtacviet' : 'wetriedtls');
        order.push(`${novelId}:${n}`);
        if (novelId === 'stv-3') await held.p;
        release();
        return {};
      };
      await DownloadQueueService.enqueue({ novelId: 'stv-3', chapterNumber: 1, options: RAW });
      await DownloadQueueService.enqueue({ novelId: 'wtl-1', chapterNumber: 1, options: RAW }, { lane: 'new' });
      await waitUntil(() => order.includes('wtl-1:1'), 'another site is not held up by a busy sangtacviet turn');
      held.open();
    } finally {
      mockStorageService.downloadChapter = original;
      DownloadQueueService.clearAll();
    }
  });

  await test('pause, resume and cooldown belong to one lane; the other lanes keep going', async () => {
    DownloadQueueService.clearAll();
    DownloadQueueService.setCooldownConfig({ enabled: true, minSec: 60, maxSec: 60, errorCooldownSec: 4500, maxRetries: 3 });
    const original = mockStorageService.downloadChapter;
    const done = [];
    mockStorageService.downloadChapter = async (novelId, n) => { await new Promise((r) => setTimeout(r, 5)); done.push(`${novelId}:${n}`); return {}; };
    try {
      await DownloadQueueService.enqueueBatch([1, 2].map((n) => ({ novelId: 'cool-a', chapterNumber: n, options: RAW })));
      await waitUntil(() => { const l = laneOf('cool-a'); return l && l.cooldown && l.cooldown.active; }, 'lane A waits out its cooldown');
      await DownloadQueueService.enqueueBatch([1, 2].map((n) => ({ novelId: 'cool-b', chapterNumber: n, options: RAW })), { lane: 'new' });
      await waitUntil(() => done.includes('cool-b:1'), "lane B is not held by lane A's cooldown");
      const laneB = laneOf('cool-b').id;
      const laneA = laneOf('cool-a').id;
      DownloadQueueService.pause(laneB);
      let s = DownloadQueueService.getState();
      assert.strictEqual(s.lanes.find((l) => l.id === laneB).isPaused, true, 'lane B paused');
      assert.strictEqual(s.lanes.find((l) => l.id === laneA).isPaused, false, 'lane A not paused');
      assert.strictEqual(s.isPaused, false, 'the summary is paused only when every lane is');
      DownloadQueueService.skipCooldown(laneA);
      await waitUntil(() => done.includes('cool-a:2'), 'skipping lane A cooldown runs lane A');
      assert(!done.includes('cool-b:2'), 'paused lane B did not run');
      DownloadQueueService.resume(laneB);
      await waitUntil(() => done.includes('cool-b:2') || (laneOf('cool-b') && laneOf('cool-b').cooldown), 'lane B resumes');
      await DownloadQueueService.enqueue({ novelId: 'cool-c', chapterNumber: 1, options: RAW }, { lane: 'new' });
      await DownloadQueueService.enqueue({ novelId: 'cool-d', chapterNumber: 1, options: RAW }, { lane: 'new' });
      DownloadQueueService.pause();
      s = DownloadQueueService.getState();
      assert(s.lanes.length >= 2 && s.lanes.every((l) => l.isPaused) && s.isPaused, 'pause without a lane pauses every lane');
    } finally {
      mockStorageService.downloadChapter = original;
      DownloadQueueService.clearAll();
      DownloadQueueService.setCooldownConfig({ enabled: false, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });
    }
  });

  await test('remove finds a chapter in any lane; Clear All empties every lane', async () => {
    DownloadQueueService.clearAll();
    const original = mockStorageService.downloadChapter;
    const hold = gate();
    mockStorageService.downloadChapter = async () => { await hold.p; return {}; };
    try {
      await DownloadQueueService.enqueueBatch([1, 2].map((n) => ({ novelId: 'rm-a', chapterNumber: n, options: RAW })));
      await DownloadQueueService.enqueueBatch([1, 2].map((n) => ({ novelId: 'rm-b', chapterNumber: n, options: RAW })), { lane: 'new' });
      assert.strictEqual(await DownloadQueueService.remove('rm-b_ch2'), true);
      assert.strictEqual(DownloadQueueService.isQueued('rm-b', 2), false, 'removed from lane B');
      assert.strictEqual(DownloadQueueService.isQueued('rm-a', 2), true, 'lane A untouched');
      DownloadQueueService.clearAll();
      assert.strictEqual(DownloadQueueService.getState().lanes.length, 0, 'Clear All empties every lane');
    } finally {
      hold.open();
      mockStorageService.downloadChapter = original;
      DownloadQueueService.clearAll();
    }
  });

  await test('the saved queue keeps every lane, and a restart restores them; an old single-queue save loads as one lane', async () => {
    DownloadQueueService.clearAll();
    const original = mockStorageService.downloadChapter;
    const hold = gate();
    mockStorageService.downloadChapter = async () => { await hold.p; return {}; };
    try {
      await DownloadQueueService.enqueueBatch([1, 2].map((n) => ({ novelId: 'save-a', novelTitle: 'A', chapterNumber: n, options: RAW })));
      await DownloadQueueService.enqueueBatch([1, 2].map((n) => ({ novelId: 'save-b', novelTitle: 'B', chapterNumber: n, options: RAW })), { lane: 'new' });
      const saved = JSON.parse(JSON.stringify(global.chrome.storage.local.data['quickconverter_download_queue']));
      assert.strictEqual(saved.lanes.length, 2, 'both lanes are saved');
      assert(saved.activeTask && Array.isArray(saved.queue), 'with the summary at the top, as before');

      DownloadQueueService.clearAll();
      saved.lanes.forEach((l) => { l.isPaused = true; });
      const restored = DownloadQueueService._restoreSnapshot(saved);
      assert.strictEqual(restored.lanes.length, 2, 'both lanes come back');
      const ids = restored.lanes.map((l) => l.queue.map((t) => `${t.novelId}:${t.chapterNumber}`).join(','));
      assert(ids.includes('save-a:1,save-a:2') && ids.includes('save-b:1,save-b:2'), `each lane gets its chapters back, the active one first: ${ids}`);

      DownloadQueueService.clearAll();
      const legacy = DownloadQueueService._restoreSnapshot({ activeTask: null, queue: [{ id: 'old_ch1', novelId: 'old', chapterNumber: 1, status: 'queued' }], isPaused: true, cooldown: null, pauseError: null });
      assert.deepStrictEqual(legacy.lanes.map((l) => [l.id, l.queue.length, l.isPaused]), [['main', 1, true]], 'an old save is one lane, "main"');
    } finally {
      hold.open();
      mockStorageService.downloadChapter = original;
      DownloadQueueService.clearAll();
    }
  });

  await test('the worker answers queue messages for a lane', async () => {
    DownloadQueueService.clearAll();
    const original = mockStorageService.downloadChapter;
    const hold = gate();
    mockStorageService.downloadChapter = async () => { await hold.p; return {}; };
    try {
      let reply = await DownloadQueueService.handleWorkerMessage({ action: 'QUEUE_ENQUEUE', task: { novelId: 'msg-a', chapterNumber: 1, options: RAW } });
      assert(reply.success && reply.state.lanes.length === 1);
      reply = await DownloadQueueService.handleWorkerMessage({ action: 'QUEUE_ENQUEUE_BATCH', tasks: [{ novelId: 'msg-b', chapterNumber: 1, options: RAW }], lane: 'new' });
      assert.strictEqual(reply.state.lanes.length, 2, 'the lane choice travels with the message');
      const laneB = laneOf('msg-b').id;
      reply = await DownloadQueueService.handleWorkerMessage({ action: 'QUEUE_PAUSE', laneId: laneB });
      assert.strictEqual(reply.state.lanes.find((l) => l.id === laneB).isPaused, true, 'pause names its lane');
      reply = await DownloadQueueService.handleWorkerMessage({ action: 'QUEUE_GET_STATE' });
      assert.strictEqual(reply.lanes.length, 2, 'the state answer lists the lanes');
      assert.strictEqual(DownloadQueueService.handleWorkerMessage({ action: 'SOMETHING_ELSE' }), null, 'other messages are not the queue\'s');
    } finally {
      hold.open();
      mockStorageService.downloadChapter = original;
      DownloadQueueService.clearAll();
    }
  });

  await test('in the extension, a page mirrors every lane of the worker and acts on a lane by its id', async () => {
    const vm = require('vm');
    const fsMod = require('fs');
    const pathMod = require('path');
    const src = (...p) => fsMod.readFileSync(pathMod.join(__dirname, '..', 'src', ...p), 'utf8');
    const contexts = [];
    const data = {};
    const makeChrome = (self) => ({
      runtime: {
        id: 'qc-test',
        lastError: undefined,
        onMessage: { addListener: (fn) => self.listeners.push(fn), removeListener: (fn) => { self.listeners = self.listeners.filter((l) => l !== fn); } },
        sendMessage(msg, cb) {
          const copy = JSON.parse(JSON.stringify(msg));
          let answered = false;
          let waiting = false;
          const reply = (response) => {
            if (answered) return;
            answered = true;
            if (cb) setTimeout(() => cb(response === undefined ? undefined : JSON.parse(JSON.stringify(response))), 0);
          };
          setTimeout(() => {
            contexts.filter((c) => c !== self).forEach((c) => c.listeners.forEach((l) => { if (l(copy, { id: 'qc-test' }, reply) === true) waiting = true; }));
            if (!waiting) reply(undefined);
          }, 0);
        }
      },
      storage: {
        local: {
          get: (keys, cb) => { const out = {}; (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in data) out[k] = JSON.parse(JSON.stringify(data[k])); }); setTimeout(() => cb(out), 0); },
          set: (items, cb) => {
            const changes = {};
            Object.entries(items).forEach(([k, v]) => { data[k] = JSON.parse(JSON.stringify(v)); changes[k] = { newValue: JSON.parse(JSON.stringify(v)) }; });
            contexts.forEach((c) => c.storageListeners.forEach((l) => setTimeout(() => l(changes, 'local'), 0)));
            if (cb) setTimeout(cb, 0);
          }
        },
        onChanged: { addListener: (fn) => self.storageListeners.push(fn) }
      },
      alarms: { create() {}, clear() { return Promise.resolve(true); }, onAlarm: { addListener() {} } }
    });
    const makeContext = (isPage) => {
      const self = { listeners: [], storageListeners: [] };
      const env = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, setInterval, clearInterval, AbortController, Promise };
      env.chrome = makeChrome(self);
      env.globalThis = env;
      env.self = env;
      if (isPage) {
        env.window = env;
        env.document = { addEventListener() {} };
      }
      vm.createContext(env);
      vm.runInContext(src('services', 'platform.js'), env);
      self.env = env;
      contexts.push(self);
      return self;
    };
    const worker = makeContext(false);
    const gates = {};
    worker.env.StorageService = {
      downloadChapter: (novelId, n) => new Promise((resolve) => { gates[`${novelId}:${n}`] = () => resolve({ id: `${novelId}_ch${n}` }); })
    };
    vm.runInContext(src('services', 'download-queue.js'), worker.env);
    worker.listeners.push((msg, sender, sendResponse) => {
      const r = worker.env.DownloadQueueService.handleWorkerMessage(msg);
      if (!r) return false;
      r.then(sendResponse);
      return true;
    });
    const page = makeContext(true);
    vm.runInContext(src('services', 'download-queue.js'), page.env);
    const W = worker.env.DownloadQueueService;
    const P = page.env.DownloadQueueService;
    W.setCooldownConfig({ enabled: false, minSec: 1, maxSec: 1 });
    await new Promise((r) => setTimeout(r, 20));
    const lanesOf = (svc) => JSON.parse(JSON.stringify(svc.getState().lanes.map((l) => ({ id: l.id, active: l.activeTask && `${l.activeTask.novelId}:${l.activeTask.chapterNumber}`, waiting: l.queue.length, paused: l.isPaused }))));

    await P.enqueueBatch([1, 2].map((n) => ({ novelId: 'ext-a', novelTitle: 'A', chapterNumber: n, options: RAW })));
    await P.enqueueBatch([1, 2].map((n) => ({ novelId: 'ext-b', novelTitle: 'B', chapterNumber: n, options: RAW })), { lane: 'new' });
    await waitUntil(() => W.getState().lanes.length === 2, 'the worker made two lanes');
    await waitUntil(() => JSON.stringify(lanesOf(P)) === JSON.stringify(lanesOf(W)), 'the page shows the same lanes');
    assert.deepStrictEqual(lanesOf(P).map((l) => l.active), ['ext-a:1', 'ext-b:1'], 'both lanes active, as the page sees them');
    assert.strictEqual(P.getChapterStatus('ext-b', 2).status, 'queued', 'chapter status on the page looks across lanes');

    const laneB = lanesOf(P).find((l) => l.active === 'ext-b:1').id;
    P.pause(laneB);
    await waitUntil(() => W.getState().lanes.find((l) => l.id === laneB).isPaused, 'pausing on the page pauses that lane in the worker');
    assert.strictEqual(W.getState().lanes.find((l) => l.id !== laneB).isPaused, false, 'and not the other lane');

    gates['ext-a:1']();
    await waitUntil(() => lanesOf(P).some((l) => l.active === 'ext-a:2'), 'the page follows the worker as lane A goes on');

    P.clearAll();
    await waitUntil(() => W.getState().lanes.length === 0 && P.getState().lanes.length === 0, 'Clear All empties every lane on both sides');
    Object.values(gates).forEach((open) => open());
  });

  await test('the extension worker hands queue messages and cooldown alarms to the queue service', () => {
    const bg = require('fs').readFileSync(require('path').join(__dirname, '..', 'extension', 'scripts', 'background.js'), 'utf8');
    assert(/DownloadQueueService\.handleWorkerMessage\(message\)/.test(bg), 'queue messages go to handleWorkerMessage');
    assert(!/message\.action === 'QUEUE_/.test(bg), 'no queue message is handled outside the service');
    assert(/DownloadQueueService\.onCooldownAlarm\(alarm\.name\)/.test(bg) && /QUEUE_COOLDOWN_ALARM/.test(bg), "a lane's cooldown alarm wakes that lane");
  });

  console.log(`\n🎉 All ${passedCount} DownloadQueueService tests passed!`);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
