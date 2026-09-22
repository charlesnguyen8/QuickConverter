const assert = require('assert');
const path = require('path');

console.log('--- Running Platform Adapter Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const Platform = require(path.join(repoRoot, 'services', 'platform.js'));

(async () => {
  assert.ok(Platform, 'Platform export must exist');
  assert.strictEqual(typeof Platform.name, 'string');
  assert.strictEqual(Platform.isExtension, false, 'Node has no chrome.runtime -> web platform');

  ['get', 'set', 'remove'].forEach((m) => {
    assert.strictEqual(typeof Platform.storage[m], 'function', `storage.${m} must be a function`);
  });
  assert.strictEqual(typeof Platform.messaging.send, 'function');
  assert.strictEqual(typeof Platform.messaging.subscribe, 'function');
  assert.strictEqual(typeof Platform.alarms.create, 'function');
  assert.strictEqual(typeof Platform.alarms.clear, 'function');
  assert.strictEqual(typeof Platform.alarms.subscribe, 'function');
  assert.strictEqual(typeof Platform.runtime.getURL, 'function');
  assert.strictEqual(typeof Platform.runtime.openUrl, 'function');
  console.log('✓ Platform interface exposes storage/messaging/alarms/runtime');

  await Platform.storage.set('qc_platform_test', 'v1');
  assert.strictEqual(await Platform.storage.get('qc_platform_test'), 'v1');
  await Platform.storage.set('qc_platform_test', 'v2');
  assert.strictEqual(await Platform.storage.get('qc_platform_test'), 'v2');
  await Platform.storage.remove('qc_platform_test');
  assert.strictEqual(await Platform.storage.get('qc_platform_test'), undefined);
  console.log('✓ Platform.storage set/get/remove round-trip');

  let received = null;
  const unsubscribe = Platform.messaging.subscribe((msg) => { received = msg; });
  await Platform.messaging.send({ type: 'ping', n: 1 });
  assert.deepStrictEqual(received, { type: 'ping', n: 1 });
  unsubscribe();
  received = null;
  await Platform.messaging.send({ type: 'pong' });
  assert.strictEqual(received, null, 'Unsubscribe must stop delivery');
  console.log('✓ Platform.messaging send/subscribe/unsubscribe');

  assert.strictEqual(await Platform.alarms.clear('missing'), false);
  const unsubscribeAlarm = Platform.alarms.subscribe(() => {});
  assert.strictEqual(typeof unsubscribeAlarm, 'function');
  unsubscribeAlarm();
  console.log('✓ Platform.alarms create/clear/subscribe');

  assert.strictEqual(Platform.runtime.getURL('views/library.html'), 'views/library.html');
  console.log('✓ Platform.runtime.getURL resolves relative path in web mode');

  console.log('🎉 Platform Test Suite: ALL TESTS PASSED!');
})().catch((err) => {
  console.error('✗ Platform test failed:', err.message);
  process.exit(1);
});
