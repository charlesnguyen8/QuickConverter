const assert = require('assert');
const path = require('path');

console.log('--- Running Platform Adapter Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const Platform = require(path.join(repoRoot, 'src', 'services', 'platform.js'));

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

  // --- Web mode: no native areas, an in-page message bus, no Google sign-in ---
  assert.strictEqual(Platform.storage.area('local'), null, 'no native storage area on the web: services keep their localStorage fallback');
  assert.strictEqual(Platform.storage.area('session'), null);
  assert.strictEqual(Platform.identity, null, 'no Google sign-in outside the extension (yet)');
  assert.strictEqual(Platform.runtime.isExtension(), false);
  assert.strictEqual(Platform.messaging.isNative(), false);
  const offChanged = Platform.storage.onChanged(() => {});
  assert.strictEqual(typeof offChanged, 'function');
  offChanged();
  const replies = [];
  const offBus = Platform.messaging.subscribe((msg, sender, sendResponse) => { replies.push(msg.action); sendResponse({ ok: msg.action }); return true; });
  assert.deepStrictEqual(await Platform.messaging.send({ action: 'CHAPTER_SAVED' }), { ok: 'CHAPTER_SAVED' }, 'in-page listeners can answer');
  offBus();
  assert.strictEqual(await Platform.messaging.send({ action: 'NOBODY' }), undefined, 'nobody listening: resolves undefined');
  assert.deepStrictEqual(replies, ['CHAPTER_SAVED']);
  await Platform.runtime.ping();
  console.log('✓ Web mode: no native storage areas, in-page message bus, no identity');

  // --- Chrome mode, in a sandbox with a callback-style fake chrome ---
  const vm = require('vm');
  const fs = require('fs');
  const platformCode = fs.readFileSync(path.join(repoRoot, 'src', 'services', 'platform.js'), 'utf8');
  function fakeChrome() {
    const areas = { local: { a: 1, b: 2 }, session: {} };
    const listeners = { message: [], changed: [], alarm: [] };
    const calls = [];
    const area = (name) => ({
      get: (keys, cb) => { const out = {}; [].concat(keys).forEach((k) => { if (k in areas[name]) out[k] = areas[name][k]; }); cb(out); },
      set: (items, cb) => { Object.assign(areas[name], items); if (cb) cb(); },
      remove: (keys, cb) => { [].concat(keys).forEach((k) => delete areas[name][k]); if (cb) cb(); }
    });
    const chrome = {
      storage: { local: area('local'), session: area('session'), onChanged: { addListener: (fn) => listeners.changed.push(fn), removeListener: (fn) => { listeners.changed = listeners.changed.filter((f) => f !== fn); } } },
      runtime: {
        id: 'ext-id',
        lastError: undefined,
        sendMessage: (msg, cb) => {
          calls.push(msg);
          if (msg.action === 'FAIL') { chrome.runtime.lastError = { message: 'Receiving end does not exist.' }; cb(undefined); chrome.runtime.lastError = undefined; return; }
          cb({ echo: msg.action });
        },
        onMessage: { addListener: (fn) => listeners.message.push(fn), removeListener: (fn) => { listeners.message = listeners.message.filter((f) => f !== fn); } },
        getURL: (p) => `chrome-extension://ext-id/${p}`,
        getPlatformInfo: (cb) => { calls.push('ping'); cb({ os: 'win' }); }
      },
      alarms: { create: (name, info) => calls.push(['alarm', name, info]), clear: (name, cb) => { calls.push(['clear', name]); if (cb) cb(true); }, onAlarm: { addListener: (fn) => listeners.alarm.push(fn), removeListener() {} } },
      identity: {
        getAuthToken: (opts, cb) => { calls.push(['token', opts]); if (opts.interactive === 'fail') { chrome.runtime.lastError = { message: 'The user did not approve access.' }; cb(undefined); chrome.runtime.lastError = undefined; return; } cb('tok-1'); },
        removeCachedAuthToken: (opts, cb) => { calls.push(['remove-token', opts.token]); cb(); }
      }
    };
    return { chrome, areas, listeners, calls };
  }
  const fake = fakeChrome();
  const env = { console, setTimeout, clearTimeout, chrome: fake.chrome };
  env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(platformCode, env);
  const P = env.Platform;
  assert(P, 'Platform is exposed on globalThis for classic scripts and workers');
  assert.strictEqual(P.runtime.isExtension(), true);
  assert.strictEqual(P.messaging.isNative(), true);

  const local = P.storage.area('local');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(await local.get(['a', 'missing']))), { a: 1 });
  await local.set({ c: 3 });
  assert.strictEqual(fake.areas.local.c, 3);
  await local.remove(['a']);
  assert(!('a' in fake.areas.local));
  await P.storage.area('session').set({ k: 'v' });
  assert.strictEqual(fake.areas.session.k, 'v');
  console.log('✓ Chrome mode: storage areas wrap chrome.storage.local/session');

  assert.deepStrictEqual(JSON.parse(JSON.stringify(await P.messaging.send({ action: 'PING' }))), { echo: 'PING' });
  await assert.rejects(() => P.messaging.send({ action: 'FAIL' }), /Receiving end does not exist/, 'lastError rejects so callers can fall back');
  const off = P.messaging.subscribe((msg, sender, sendResponse) => { sendResponse(msg.action); return true; });
  assert.strictEqual(fake.listeners.message.length, 1);
  let answered = null;
  const keepOpen = fake.listeners.message[0]({ action: 'Q' }, {}, (r) => { answered = r; });
  assert.strictEqual(keepOpen, true, 'the handler\'s "reply later" return value reaches Chrome');
  assert.strictEqual(answered, 'Q');
  off();
  assert.strictEqual(fake.listeners.message.length, 0);
  console.log('✓ Chrome mode: messaging wraps runtime.sendMessage/onMessage');

  const offStorage = P.storage.onChanged((changes, area) => { answered = [Object.keys(changes), area]; });
  fake.listeners.changed[0]({ x: { newValue: 1 } }, 'local');
  assert.deepStrictEqual(answered, [['x'], 'local']);
  offStorage();
  assert.strictEqual(fake.listeners.changed.length, 0);

  assert.strictEqual(P.alarms.isNative(), true);
  assert.strictEqual(Platform.alarms.isNative(), false, 'web alarms are page timers');
  await P.alarms.create('QUEUE_COOLDOWN_ALARM', { when: 5 });
  assert.strictEqual(await P.alarms.clear('QUEUE_COOLDOWN_ALARM'), true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(fake.calls.filter((c) => Array.isArray(c) && (c[0] === 'alarm' || c[0] === 'clear')))), [['alarm', 'QUEUE_COOLDOWN_ALARM', { when: 5 }], ['clear', 'QUEUE_COOLDOWN_ALARM']]);
  await P.runtime.ping();
  assert(fake.calls.includes('ping'), 'ping keeps the extension worker alive');
  assert.strictEqual(P.runtime.getURL('views/reader.html'), 'chrome-extension://ext-id/views/reader.html');
  console.log('✓ Chrome mode: storage changes, alarms, ping and getURL');

  assert.strictEqual(await P.identity.getAuthToken({ interactive: true, scopes: ['s'] }), 'tok-1');
  await assert.rejects(() => P.identity.getAuthToken({ interactive: 'fail', scopes: ['s'] }), /did not approve/);
  await P.identity.removeCachedAuthToken('tok-1');
  assert(fake.calls.some((c) => Array.isArray(c) && c[0] === 'remove-token' && c[1] === 'tok-1'));
  await P.identity.clearAllCachedAuthTokens();
  fake.chrome.identity.clearAllCachedAuthTokens = (cb) => { fake.calls.push('clear-all'); cb(); };
  await P.identity.clearAllCachedAuthTokens();
  assert(fake.calls.includes('clear-all'), 'sign-out clears every cached token when Chrome supports it');
  console.log('✓ Chrome mode: identity wraps chrome.identity');

  const late = { console, setTimeout, clearTimeout };
  late.globalThis = late;
  vm.createContext(late);
  vm.runInContext(platformCode, late);
  assert.strictEqual(late.Platform.storage.area('local'), null);
  late.chrome = fakeChrome().chrome;
  assert(late.Platform.storage.area('local'), 'chrome is checked per call, not once at load');
  assert.strictEqual(late.Platform.runtime.isExtension(), true);
  console.log('✓ Platform detects chrome per call');

  for (const view of ['library', 'novel', 'popup', 'reader', 'settings', 'ocr-panel']) {
    const html = fs.readFileSync(path.join(repoRoot, 'src', 'views', `${view}.html`), 'utf8');
    const services = [...html.matchAll(/<script src="\.\.\/services\/([^"]+)"><\/script>/g)].map((m) => m[1]);
    assert.strictEqual(services[0], 'platform.js', `${view}.html must load services/platform.js before any other service`);
    assert.strictEqual(services.filter((s) => s === 'platform.js').length, 1, `${view}.html loads platform.js once`);
  }
  const worker = fs.readFileSync(path.join(repoRoot, 'src', 'scripts', 'background.js'), 'utf8').match(/importScripts\(([^)]*)\)/)[1];
  const workerServices = [...worker.matchAll(/'\.\.\/services\/([^']+)'/g)].map((m) => m[1]);
  assert.strictEqual(workerServices[0], 'platform.js', 'the service worker imports platform.js before any other service');
  console.log('✓ Every view and the worker load platform.js before the services');

  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|jsx)$/.test(entry.name)) {
        fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
          if (/\bchrome\.(runtime|storage|tabs|alarms|identity|declarativeNetRequest|action|scripting)\b/.test(line) && !/^\s*(\/\/|\*)/.test(line)) {
            offenders.push(`${path.relative(repoRoot, full)}:${i + 1}`);
          }
        });
      }
    }
  };
  walk(path.join(repoRoot, 'src', 'services'));
  walk(path.join(repoRoot, 'src', 'components'));
  walk(path.join(repoRoot, 'src', 'providers'));
  const allowed = [path.join('src', 'services', 'platform.js')];
  const bad = offenders.filter((o) => !allowed.some((a) => o.startsWith(a)));
  assert.deepStrictEqual(bad, [], `services, components and providers reach Chrome only through platform.js:\n${bad.join('\n')}`);
  console.log('✓ Services, components and providers use Chrome only through platform.js');

  console.log('🎉 Platform Test Suite: ALL TESTS PASSED!');
})().catch((err) => {
  console.error('✗ Platform test failed:', err.message);
  process.exit(1);
});
