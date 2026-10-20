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
const bookPiece = (id) => `qc-book-${id}.json`;
const namesPiece = (id, kind) => `qc-names-${id}-${kind}.json`;
const chaptersPiece = (id, n) => `qc-chapters-${id}-${n}.json`;
const v2BookFile = (id) => `quickconverter-book-${id}.json`;

async function seedBooks(device) {
  await device.S.addNovel({ id: 'b1', title: 'Book One', slug: 'one' });
  await device.S.addNovel({ id: 'b2', title: 'Book Two', slug: 'two' });
  await device.S.saveChapter({ novelId: 'b1', chapterNumber: 1, title: 'One/1', rawText: 'one-1' });
  await device.S.saveChapter({ novelId: 'b2', chapterNumber: 1, title: 'Two/1', rawText: 'two-1' });
}

async function twoSyncedDevices() {
  const drive = makeDrive();
  const a = makeDevice(drive);
  await seedBooks(a);
  await a.cloud.sync();
  const b = makeDevice(drive);
  await b.cloud.sync();
  await wait(5);
  return { drive, a, b };
}

const transfers = (drive, from) => drive.log.slice(from).filter((e) => e.op !== 'list').map((e) => `${e.op} ${e.name}`);
const bookIds = (device) => Object.keys(device.stores.novels).filter((k) => !k.includes('::')).sort();

let finished = false;
process.on('beforeExit', () => {
  if (!finished) {
    console.error('Drive Sync suite stopped before its last test (a promise never settled)');
    process.exitCode = 1;
  }
});

(async () => {
  await test('the first sync stores each book as small pieces plus an index', async () => {
    const drive = makeDrive();
    const a = makeDevice(drive);
    await seedBooks(a);
    await a.S.addNameEntry('b1', { original: 'Lin Dong', translation: 'Lâm Động' });
    await a.S.saveChapter({ novelId: 'b1', chapterNumber: 75, title: 'One/75', rawText: 'one-75' });
    await a.S.setLastRead('b1', { chapterNumber: 75, paragraph: 3 });
    await a.cloud.sync();
    assert.deepStrictEqual(drive.names(), [
      bookPiece('b1'), bookPiece('b2'),
      chaptersPiece('b1', 0), chaptersPiece('b1', 1), chaptersPiece('b2', 0),
      namesPiece('b1', 'namelist'),
      INDEX
    ].sort());
    const index = drive.content(INDEX);
    assert.strictEqual(index.format, 'quickconverter-sync');
    assert.strictEqual(index.version, 3);
    assert.deepStrictEqual(Object.keys(index.books.b1.pieces).sort(), ['book', 'chapters.0', 'chapters.1', 'names.namelist']);
    assert.strictEqual(index.books.b1.lastRead.chapterNumber, 75, 'the reading position lives in the index');
    assert.strictEqual(drive.content(bookPiece('b1')).novel.lastRead, undefined, 'not in the book piece');
    assert.strictEqual(drive.content(bookPiece('b1')).novel.nameList, undefined, 'names are their own piece');
    assert.deepStrictEqual(drive.content(chaptersPiece('b1', 1)).chapters.map((c) => c.rawText), ['one-75'], 'chapters 50-99');
    assert.strictEqual(drive.content(namesPiece('b1', 'namelist')).list[0].original, 'Lin Dong');
  });

  await test('another device gets every book from the pieces', async () => {
    const drive = makeDrive();
    const a = makeDevice(drive);
    await seedBooks(a);
    await a.S.addNameEntry('b1', { original: 'Lin Dong', translation: 'Lâm Động' });
    await a.S.setLastRead('b1', { chapterNumber: 1, paragraph: 4 });
    await a.cloud.sync();
    const b = makeDevice(drive);
    const result = await b.cloud.sync();
    assert.deepStrictEqual(bookIds(b), ['b1', 'b2']);
    assert.strictEqual(b.stores.chapters.b2_ch1.rawText, 'two-1');
    assert.strictEqual((await b.S.getNameList('b1'))[0].original, 'Lin Dong');
    assert.strictEqual((await b.S.getNovelById('b1')).lastRead.paragraph, 4);
    assert.deepStrictEqual(plain(result.received), { novels: 2, chapters: 2, deleted: 0 });
  });

  await test('a new chapter transfers only its batch of chapters and the index', async () => {
    const { drive, a, b } = await twoSyncedDevices();
    await a.S.saveChapter({ novelId: 'b1', chapterNumber: 2, title: 'One/2', rawText: 'one-2' });
    let from = drive.log.length;
    await a.cloud.sync();
    assert.deepStrictEqual(transfers(drive, from), [`download ${INDEX}`, `download ${chaptersPiece('b1', 0)}`, `update ${chaptersPiece('b1', 0)}`, `update ${INDEX}`]);

    from = drive.log.length;
    const result = await b.cloud.sync();
    assert.deepStrictEqual(transfers(drive, from), [`download ${INDEX}`, `download ${chaptersPiece('b1', 0)}`], 'the other device downloads that batch and writes nothing');
    assert.strictEqual(b.stores.chapters.b1_ch2.rawText, 'one-2');
    assert.deepStrictEqual(plain(result.received), { novels: 0, chapters: 1, deleted: 0 });

    from = drive.log.length;
    await b.cloud.sync();
    assert.deepStrictEqual(transfers(drive, from), [`download ${INDEX}`], 'nothing changed: only the index is read');
  });

  await test('a sync reads chapter text on the device only for the batch that changed', async () => {
    const { a } = await twoSyncedDevices();
    for (let n = 2; n <= 120; n++) {
      await a.S.saveChapter({ novelId: 'b1', chapterNumber: n, title: `One/${n}`, rawText: `one-${n}` });
    }
    await a.cloud.sync();
    a.reads.chapterGetAll = 0;
    a.reads.chapterGet = 0;
    await a.cloud.sync();
    assert.deepStrictEqual(plain(a.reads), { chapterGetAll: 0, chapterGet: 0 }, 'nothing changed: no chapter is read');
    await a.S.saveChapter({ novelId: 'b1', chapterNumber: 121, title: 'One/121', rawText: 'one-121' });
    a.reads.chapterGet = 0;
    await a.cloud.sync();
    assert.strictEqual(a.reads.chapterGetAll, 0, 'never the whole library');
    assert(a.reads.chapterGet > 0 && a.reads.chapterGet <= 50, `only the changed batch (read ${a.reads.chapterGet})`);
  });

  await test('reading a chapter transfers only the index', async () => {
    const { drive, a, b } = await twoSyncedDevices();
    await b.S.setLastRead('b1', { chapterNumber: 1, paragraph: 9 });
    let from = drive.log.length;
    await b.cloud.sync();
    assert.deepStrictEqual(transfers(drive, from), [`download ${INDEX}`, `update ${INDEX}`]);
    from = drive.log.length;
    await a.cloud.sync();
    assert.deepStrictEqual(transfers(drive, from), [`download ${INDEX}`]);
    assert.strictEqual((await a.S.getNovelById('b1')).lastRead.paragraph, 9, 'the position arrives with the index');
  });

  await test('a name change transfers only that name list and the index', async () => {
    const { drive, a, b } = await twoSyncedDevices();
    await a.S.addNameEntry('b1', { original: 'Lin Dong', translation: 'Lâm Động' });
    let from = drive.log.length;
    await a.cloud.sync();
    assert.deepStrictEqual(transfers(drive, from), [`download ${INDEX}`, `create ${namesPiece('b1', 'namelist')}`, `update ${INDEX}`]);
    from = drive.log.length;
    await b.cloud.sync();
    assert.deepStrictEqual(transfers(drive, from), [`download ${INDEX}`, `download ${namesPiece('b1', 'namelist')}`]);
    assert.strictEqual((await b.S.getNameList('b1'))[0].original, 'Lin Dong');
  });

  await test('Sync Catalog transfers only the book piece and the index', async () => {
    const { drive, a, b } = await twoSyncedDevices();
    await a.S.updateNovel('b1', { totalChapters: 900, chapterList: [{ chapterNumber: 1, slug: 'c1', title: 'One/1' }] });
    let from = drive.log.length;
    await a.cloud.sync();
    assert.deepStrictEqual(transfers(drive, from), [`download ${INDEX}`, `download ${bookPiece('b1')}`, `update ${bookPiece('b1')}`, `update ${INDEX}`]);
    from = drive.log.length;
    await b.cloud.sync();
    assert.deepStrictEqual(transfers(drive, from), [`download ${INDEX}`, `download ${bookPiece('b1')}`]);
    assert.strictEqual((await b.S.getNovelById('b1')).totalChapters, 900);
  });

  await test('name edits made on both devices between syncs are all kept', async () => {
    const drive = makeDrive();
    const a = makeDevice(drive);
    await seedBooks(a);
    const lin = await a.S.addNameEntry('b1', { original: 'Lin Dong', translation: 'Lâm Động' });
    const wang = await a.S.addNameEntry('b1', { original: 'Wang Lin', translation: 'Vương Lâm' });
    await a.cloud.sync();
    const b = makeDevice(drive);
    await b.cloud.sync();

    await wait(5);
    await a.S.addNameEntry('b1', { original: 'Xiao Yan', translation: 'Tiêu Viêm' });
    await b.S.updateNameEntry('b1', lin.id, { translation: 'Lâm Động (sửa)' });
    await b.S.deleteNameEntry('b1', wang.id);
    await a.cloud.sync();
    await b.cloud.sync();
    await a.cloud.sync();

    for (const [label, device] of [['A', a], ['B', b]]) {
      const names = await device.S.getNameList('b1');
      const byOriginal = Object.fromEntries(names.map((e) => [e.original, e.translation]));
      assert.deepStrictEqual(Object.keys(byOriginal).sort(), ['Lin Dong', 'Xiao Yan'], `${label}: the addition kept, the removal applied`);
      assert.strictEqual(byOriginal['Lin Dong'], 'Lâm Động (sửa)', `${label}: the edit kept`);
    }
  });

  await test('a book deleted on one device is deleted on the other and all its pieces removed', async () => {
    const { drive, a, b } = await twoSyncedDevices();
    await b.S.deleteNovel('b2');
    await b.cloud.sync();
    assert(!drive.names().some((n) => n.includes('-b2')), 'pieces removed');
    assert(drive.content(INDEX).deleted.novels.b2, 'deletion marker in the index');
    assert.strictEqual(drive.content(INDEX).books.b2, undefined);

    const result = await a.cloud.sync();
    assert.strictEqual(a.stores.novels.b2, undefined, 'gone on the other device');
    assert.strictEqual(a.stores.chapters.b2_ch1, undefined, 'with its chapters');
    assert.deepStrictEqual(plain(result.received), { novels: 0, chapters: 0, deleted: 2 });
  });

  await test('Drive data from the previous version (one file per book) moves to pieces', async () => {
    const drive = makeDrive();
    const old = makeDevice(drive);
    await seedBooks(old);
    const exported = await old.S.exportAll();
    const books = {};
    for (const novel of exported.novels) {
      const chapters = exported.chapters.filter((c) => c.novelId === novel.id);
      const file = drive.put(v2BookFile(novel.id), { format: 'quickconverter-sync', version: 2, novel, chapters });
      books[novel.id] = { file, sig: 'v2', title: novel.title };
    }
    drive.put(INDEX, { format: 'quickconverter-sync', version: 2, books, deleted: { novels: {}, chapters: {} }, preferences: {} });

    const fresh = makeDevice(drive);
    await fresh.S.addNovel({ id: 'b3', title: 'Book Three', slug: 'three' });
    await fresh.cloud.sync();
    assert.deepStrictEqual(bookIds(fresh), ['b1', 'b2', 'b3'], 'merged with the previous Drive data');
    assert.strictEqual(drive.content(INDEX).version, 3);
    assert.deepStrictEqual(Object.keys(drive.content(INDEX).books).sort(), ['b1', 'b2', 'b3']);
    assert(!drive.names().some((n) => n.startsWith('quickconverter-book-')), 'the previous files are removed');
    assert(drive.names().includes(chaptersPiece('b1', 0)));
  });

  await test('a library synced with the old single backup file moves to pieces', async () => {
    const drive = makeDrive();
    const old = makeDevice(drive);
    await seedBooks(old);
    drive.put(LEGACY, await old.S.exportAll());
    const fresh = makeDevice(drive);
    await fresh.S.addNovel({ id: 'b3', title: 'Book Three', slug: 'three' });
    await fresh.cloud.sync();
    assert.deepStrictEqual(bookIds(fresh), ['b1', 'b2', 'b3'], 'merged with the old backup');
    assert.deepStrictEqual(Object.keys(drive.content(INDEX).books).sort(), ['b1', 'b2', 'b3']);
    assert(drive.names().includes(LEGACY), 'the old file is left in place');
  });

  await test('Drive data written by a newer version is left alone', async () => {
    const drive = makeDrive();
    drive.put(INDEX, { format: 'quickconverter-sync', version: 99, books: {}, deleted: {}, preferences: {} });
    const a = makeDevice(drive);
    await seedBooks(a);
    const from = drive.log.length;
    await assert.rejects(() => a.cloud.sync(), /update QuickConverter/i);
    assert.deepStrictEqual(transfers(drive, from), [`download ${INDEX}`], 'nothing written');
  });

  await test('Replace Drive copy and Replace this device use the pieces', async () => {
    const { drive, a, b } = await twoSyncedDevices();
    await b.S.addNovel({ id: 'b9', title: 'Only on B', slug: 'nine' });
    await b.S.deleteNovel('b1');
    await b.S.deleteNovel('b2');
    await b.cloud.backup();
    assert.deepStrictEqual(Object.keys(drive.content(INDEX).books), ['b9'], 'Drive now mirrors B');
    assert.deepStrictEqual(drive.names(), [bookPiece('b9'), INDEX].sort(), 'other pieces removed');

    await a.cloud.restore();
    assert.deepStrictEqual(bookIds(a), ['b9'], 'A now mirrors Drive');
  });

  console.log(`--- Drive Sync Test Suite: ${passed}/${passed + failed} passed ---`);
  if (failed > 0) {
    console.error('Drive Sync Test Suite FAILED');
    process.exit(1);
  }
  console.log('Drive Sync Test Suite: ALL TESTS PASSED!');
  finished = true;
})();
