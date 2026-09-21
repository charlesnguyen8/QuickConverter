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
let mockFailChapter = null;
let mockDelayMs = 20;

const mockStorageService = {
  async downloadChapter(novelId, chNum, options) {
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

    return { success: true };
  }
};

global.StorageService = mockStorageService;

// Load DownloadQueueService fresh
delete require.cache[require.resolve('../services/download-queue.js')];
const DownloadQueueService = require('../services/download-queue.js');

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
  await test('Clear All empties waiting queue and immediately aborts active task', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    mockDelayMs = 150;

    await DownloadQueueService.enqueue({ novelId: 'novel-f', chapterNumber: 50 });
    await DownloadQueueService.enqueue({ novelId: 'novel-f', chapterNumber: 51 });
    await DownloadQueueService.enqueue({ novelId: 'novel-f', chapterNumber: 52 });

    DownloadQueueService.clearAll();

    const state = DownloadQueueService.getState();
    assert.strictEqual(state.activeTask, null, 'Active task should be null');
    assert.strictEqual(state.queue.length, 0, 'Queue should be empty');
    assert.strictEqual(state.totalCount, 0, 'Total count should be 0');
    assert.strictEqual(state.isProcessing, false, 'Processing should be false');

    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.strictEqual(downloadedTasks.length, 0, 'No tasks should have completed');
  });

  // 8. Error resilience test (skips to next chapter on failure)
  await test('Error resilience: failed chapter is skipped and queue proceeds with next chapter', async () => {
    downloadedTasks = [];
    DownloadQueueService.clearAll();
    mockDelayMs = 30;
    mockFailChapter = 61; // Ch 61 will fail

    await DownloadQueueService.enqueue({ novelId: 'novel-g', chapterNumber: 60 });
    await DownloadQueueService.enqueue({ novelId: 'novel-g', chapterNumber: 61 }); // fails
    await DownloadQueueService.enqueue({ novelId: 'novel-g', chapterNumber: 62 });

    // Wait for queue to finish all
    await new Promise((resolve) => {
      const unsub = DownloadQueueService.subscribe((s) => {
        if (s.totalCount === 0 && !s.isProcessing) {
          unsub();
          resolve();
        }
      });
    });

    assert.strictEqual(downloadedTasks.length, 2, 'Ch 60 and Ch 62 should be downloaded');
    assert.strictEqual(downloadedTasks[0].chapterNumber, 60, 'Ch 60 downloaded');
    assert.strictEqual(downloadedTasks[1].chapterNumber, 62, 'Ch 62 downloaded despite Ch 61 failing');
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

  console.log(`\n🎉 All ${passedCount} DownloadQueueService tests passed!`);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
