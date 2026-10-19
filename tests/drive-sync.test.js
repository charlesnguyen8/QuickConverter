const assert = require('assert');
const { makeDrive, makeDevice } = require('./helpers/fake-library');

console.log('\n--- Running Drive Sync (two devices) Test Suite ---');

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

const plain = (v) => JSON.parse(JSON.stringify(v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const INDEX = 'quickconverter-index.json';
const LEGACY = 'quickconverter-backup.json';
const bookFile = (id) => `quickconverter-book-${id}.json`;

async function seedBooks(device) {
  await device.S.addNovel({ id: 'b1', title: 'Book One', slug: 'one' });
  await device.S.addNovel({ id: 'b2', title: 'Book Two', slug: 'two' });
  await device.S.saveChapter({ novelId: 'b1', chapterNumber: 1, title: 'One/1', rawText: 'one-1' });
  await device.S.saveChapter({ novelId: 'b2', chapterNumber: 1, title: 'Two/1', rawText: 'two-1' });
}

const transfers = (drive, from) => drive.log.slice(from).filter((e) => e.op !== 'list').map((e) => `${e.op} ${e.name}`);

let finished = false;
process.on('beforeExit', () => {
  if (!finished) {
    console.error('Drive Sync suite stopped before its last test (a promise never settled)');
    process.exitCode = 1;
  }
});

(async () => {
  await test('the first sync stores each book in its own Drive file plus a small index', async () => {
    const drive = makeDrive();
    const a = makeDevice(drive);
    await seedBooks(a);
    await a.cloud.sync();
    assert.deepStrictEqual(drive.names(), [bookFile('b1'), bookFile('b2'), INDEX]);
    const index = drive.content(INDEX);
    assert.strictEqual(index.format, 'quickconverter-sync');
    assert.deepStrictEqual(Object.keys(index.books).sort(), ['b1', 'b2']);
    assert(index.books.b1.sig && index.books.b1.file, 'each book has its file and fingerprint');
    const one = drive.content(bookFile('b1'));
    assert.strictEqual(one.novel.title, 'Book One');
    assert.deepStrictEqual(one.chapters.map((c) => c.rawText), ['one-1'], 'a book file holds only its own chapters');
  });

  await test('another device gets every book from the files', async () => {
    const drive = makeDrive();
    const a = makeDevice(drive);
    await seedBooks(a);
    await a.cloud.sync();
    const b = makeDevice(drive);
    const result = await b.cloud.sync();
    assert.deepStrictEqual(Object.keys(b.stores.novels).filter((k) => !k.includes('::')).sort(), ['b1', 'b2']);
    assert.strictEqual(b.stores.chapters.b2_ch1.rawText, 'two-1');
    assert.deepStrictEqual(plain(result.received), { novels: 2, chapters: 2, deleted: 0 });
  });

  await test('a change to one book transfers only that book and the index', async () => {
    const drive = makeDrive();
    const a = makeDevice(drive);
    await seedBooks(a);
    await a.cloud.sync();
    const b = makeDevice(drive);
    await b.cloud.sync();

    await wait(5);
    await a.S.saveChapter({ novelId: 'b1', chapterNumber: 2, title: 'One/2', rawText: 'one-2' });
    let from = drive.log.length;
    await a.cloud.sync();
    assert.deepStrictEqual(transfers(drive, from), [`download ${INDEX}`, `download ${bookFile('b1')}`, `update ${bookFile('b1')}`, `update ${INDEX}`], 'book two is not touched');

    from = drive.log.length;
    const result = await b.cloud.sync();
    assert.deepStrictEqual(transfers(drive, from), [`download ${INDEX}`, `download ${bookFile('b1')}`], 'the other device downloads only the changed book and writes nothing');
    assert.strictEqual(b.stores.chapters.b1_ch2.rawText, 'one-2');
    assert.deepStrictEqual(plain(result.received), { novels: 0, chapters: 1, deleted: 0 });

    from = drive.log.length;
    await b.cloud.sync();
    assert.deepStrictEqual(transfers(drive, from), [`download ${INDEX}`], 'nothing changed: only the index is read and nothing is written');
  });

  await test('reading position and names made on different devices both survive', async () => {
    const drive = makeDrive();
    const a = makeDevice(drive);
    await seedBooks(a);
    await a.cloud.sync();
    const b = makeDevice(drive);
    await b.cloud.sync();

    await wait(5);
    await a.S.saveNameList('b1', [{ id: 'n', original: 'Lin Dong', translation: 'Lâm Động', addedAt: 1 }]);
    await a.cloud.sync();
    await wait(5);
    await b.S.setLastRead('b1', { chapterNumber: 1, paragraph: 9 });
    await b.cloud.sync();
    await a.cloud.sync();
    const bookA = await a.S.getNovelById('b1');
    const bookB = await b.S.getNovelById('b1');
    assert.strictEqual(bookA.lastRead.paragraph, 9, 'A has the position read on B');
    assert.strictEqual(bookB.nameList[0].original, 'Lin Dong', 'B has the name added on A');
  });

  await test('a book deleted on one device is deleted on the other and its Drive file removed', async () => {
    const drive = makeDrive();
    const a = makeDevice(drive);
    await seedBooks(a);
    await a.cloud.sync();
    const b = makeDevice(drive);
    await b.cloud.sync();

    await b.S.deleteNovel('b2');
    await b.cloud.sync();
    assert(!drive.names().includes(bookFile('b2')), 'file removed');
    assert(drive.content(INDEX).deleted.novels.b2, 'deletion marker in the index');
    assert.strictEqual(drive.content(INDEX).books.b2, undefined);

    const result = await a.cloud.sync();
    assert.strictEqual(a.stores.novels.b2, undefined, 'gone on the other device');
    assert.strictEqual(a.stores.chapters.b2_ch1, undefined, 'with its chapters');
    assert.deepStrictEqual(plain(result.received), { novels: 0, chapters: 0, deleted: 2 });
  });

  await test('a library synced with the old single backup file moves to per-book files', async () => {
    const drive = makeDrive();
    const old = makeDevice(drive);
    await seedBooks(old);
    drive.put(LEGACY, await old.S.exportAll());
    const fresh = makeDevice(drive);
    await fresh.S.addNovel({ id: 'b3', title: 'Book Three', slug: 'three' });
    await fresh.cloud.sync();
    assert.deepStrictEqual(Object.keys(fresh.stores.novels).filter((k) => !k.includes('::')).sort(), ['b1', 'b2', 'b3'], 'merged with the old backup');
    assert.deepStrictEqual(Object.keys(drive.content(INDEX).books).sort(), ['b1', 'b2', 'b3']);
    assert(drive.names().includes(LEGACY), 'the old file is left in place');
  });

  await test('Replace Drive copy and Replace this device use the per-book files', async () => {
    const drive = makeDrive();
    const a = makeDevice(drive);
    await seedBooks(a);
    await a.cloud.sync();
    const b = makeDevice(drive);
    await b.S.addNovel({ id: 'b9', title: 'Only on B', slug: 'nine' });
    await b.cloud.backup();
    assert.deepStrictEqual(Object.keys(drive.content(INDEX).books), ['b9'], 'Drive now mirrors B');
    assert.deepStrictEqual(drive.names(), [bookFile('b9'), INDEX].sort(), 'other book files removed');

    await a.cloud.restore();
    assert.deepStrictEqual(Object.keys(a.stores.novels).filter((k) => !k.includes('::')), ['b9'], 'A now mirrors Drive');
  });

  console.log(`--- Drive Sync Test Suite: ${passed}/${passed + failed} passed ---`);
  if (failed > 0) {
    console.error('Drive Sync Test Suite FAILED');
    process.exit(1);
  }
  console.log('Drive Sync Test Suite: ALL TESTS PASSED!');
  finished = true;
})();
