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

  // Google sign-in in the Android app goes through the app's native GoogleAuth plugin.
  const nativeCalls = [];
  const capacitor = {
    PluginHeaders: [{ name: 'GoogleAuth', methods: [] }],
    nativePromise: async (plugin, method, options) => {
      nativeCalls.push(JSON.parse(JSON.stringify([plugin, method, options])));
      if (method === 'getAccessToken') {
        if (!options.interactive) throw new Error('Not signed in to Google');
        return { accessToken: 'app-tok' };
      }
      return {};
    }
  };
  const nativeEnv = { console, setTimeout, clearTimeout, Capacitor: capacitor };
  nativeEnv.globalThis = nativeEnv;
  vm.createContext(nativeEnv);
  vm.runInContext(platformCode, nativeEnv);
  const appIdentity = nativeEnv.Platform.identity;
  assert.ok(appIdentity, 'the app has Google sign-in when its GoogleAuth plugin is present');
  assert.strictEqual(await appIdentity.getAuthToken({ interactive: true, scopes: ['drive.appdata'] }), 'app-tok');
  await assert.rejects(() => appIdentity.getAuthToken({ interactive: false, scopes: ['drive.appdata'] }), /Not signed in/);
  await appIdentity.removeCachedAuthToken('app-tok');
  await appIdentity.clearAllCachedAuthTokens();
  assert.deepStrictEqual(nativeCalls, [
    ['GoogleAuth', 'getAccessToken', { interactive: true, scopes: ['drive.appdata'] }],
    ['GoogleAuth', 'getAccessToken', { interactive: false, scopes: ['drive.appdata'] }],
    ['GoogleAuth', 'clearToken', { token: 'app-tok' }],
    ['GoogleAuth', 'signOut', {}]
  ]);
  capacitor.nativePromise = async () => ({});
  await assert.rejects(() => appIdentity.getAuthToken({ interactive: true, scopes: ['s'] }), /No Google auth token/);
  const noPlugin = { console, setTimeout, clearTimeout, Capacitor: { PluginHeaders: [], nativePromise: async () => ({}) } };
  noPlugin.globalThis = noPlugin;
  vm.createContext(noPlugin);
  vm.runInContext(platformCode, noPlugin);
  assert.strictEqual(noPlugin.Platform.identity, null, 'no plugin, no sign-in');
  nativeEnv.chrome = fakeChrome().chrome;
  assert.notStrictEqual(nativeEnv.Platform.identity, appIdentity, 'the extension keeps chrome.identity');
  console.log('✓ App mode: identity goes through the native GoogleAuth plugin');

  // Native GET with headers fetch() may not set (Referer) goes through CapacitorHttp in the app.
  // Sites redirect any Android user agent to their mobile pages (nkwwlkj -> m.cddaoyue.cn), which the
  // providers do not read, so the app asks as desktop Chrome with the WebView's Chrome version.
  const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36';
  const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Safari/537.36';
  const httpCalls = [];
  const httpReplies = [
    { status: 200, data: '{"code":1}', headers: {} },
    { status: 200, data: { code: 1 }, headers: { 'Content-Type': 'application/json' } },
    { status: 403, data: '<title>Just a moment...</title>', headers: {} }
  ];
  const httpEnv = {
    console,
    navigator: { userAgent: PHONE_UA },
    setTimeout,
    clearTimeout,
    Capacitor: {
      PluginHeaders: [{ name: 'CapacitorHttp', methods: [] }],
      nativePromise: async (plugin, method, options) => {
        httpCalls.push(JSON.parse(JSON.stringify([plugin, method, options])));
        return httpReplies.shift();
      }
    }
  };
  httpEnv.globalThis = httpEnv;
  vm.createContext(httpEnv);
  vm.runInContext(platformCode, httpEnv);
  const http = httpEnv.Platform.http;
  assert.ok(http, 'the app has native HTTP');
  const listUrl = 'https://sangtacviet.com/index.php?ngmar=chapterlist&h=uukanshu&bookid=1&sajax=getchapterlist';
  assert.deepStrictEqual(JSON.parse(JSON.stringify(await http.getText(listUrl, { headers: { Referer: 'https://sangtacviet.com/' } }))), { ok: true, status: 200, text: '{"code":1}' });
  assert.deepStrictEqual(httpCalls[0], ['CapacitorHttp', 'request', { url: listUrl, method: 'GET', headers: { 'User-Agent': DESKTOP_UA, Referer: 'https://sangtacviet.com/' }, responseType: 'text' }]);
  assert.strictEqual(httpEnv.Platform.desktopUserAgent(), DESKTOP_UA, "desktop Chrome with the WebView's version");
  assert.strictEqual(httpEnv.Platform.mobileUserAgent(), 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', 'phone Chrome sends its reduced user agent, without the WebView marker');
  assert.strictEqual((await http.getText(listUrl)).text, '{"code":1}', 'a JSON reply parsed natively comes back as its text');
  assert.strictEqual((await http.getText(listUrl)).ok, false, 'an error status is not ok');
  const noHttp = { console, setTimeout, clearTimeout, Capacitor: { PluginHeaders: [], nativePromise: async () => ({}) } };
  noHttp.globalThis = noHttp;
  vm.createContext(noHttp);
  vm.runInContext(platformCode, noHttp);
  assert.strictEqual(noHttp.Platform.http, null, 'no native HTTP outside the app');
  httpEnv.chrome = fakeChrome().chrome;
  assert.strictEqual(httpEnv.Platform.http, null, 'the extension keeps fetch and its request rules');
  console.log('✓ App mode: native GET with headers through CapacitorHttp');

  // The embedded site WebView (nkwwlkj, sangtacviet chapter pages) is the app's SiteBrowser plugin.
  const siteCalls = [];
  const siteListeners = {};
  const siteEnv = {
    console,
    navigator: { userAgent: PHONE_UA },
    setTimeout,
    clearTimeout,
    Capacitor: {
      PluginHeaders: [{ name: 'SiteBrowser', methods: [] }],
      nativePromise: async (plugin, method, options) => {
        siteCalls.push(JSON.parse(JSON.stringify([plugin, method, options])));
        return {};
      },
      nativeCallback: (plugin, method, options, callback) => {
        siteCalls.push(JSON.parse(JSON.stringify([plugin, method, options])));
        siteListeners[options.eventName] = callback;
        return 'cb-1';
      }
    }
  };
  siteEnv.globalThis = siteEnv;
  vm.createContext(siteEnv);
  vm.runInContext(platformCode, siteEnv);
  const site = siteEnv.Platform.siteBrowser;
  assert.ok(site, 'the app has a site browser');
  await site.open('https://www.nkwwlkj.cn/chapter/book_chapter_detail/1', { script: 'S', visible: false });
  await site.open('https://sangtacviet.com/truyen/uukanshu/1/92019/1122/', { script: 'S', visible: false, userAgent: 'PHONE-CHROME' });
  await site.show();
  await site.hide();
  await site.close();
  const seen = [];
  const stopSite = site.subscribe((msg) => seen.push(msg));
  siteListeners.event({ data: '{"type":"chapter","rawText":"x"}' });
  siteListeners.event({ data: 'not json' });
  siteListeners.event({ data: '{"type":"closed"}' });
  stopSite();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(seen)), [{ type: 'chapter', rawText: 'x' }, { type: 'closed' }], 'messages arrive parsed; garbage is dropped');
  assert.deepStrictEqual(siteCalls, [
    ['SiteBrowser', 'open', { url: 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/1', script: 'S', visible: false, userAgent: DESKTOP_UA }],
    ['SiteBrowser', 'open', { url: 'https://sangtacviet.com/truyen/uukanshu/1/92019/1122/', script: 'S', visible: false, userAgent: 'PHONE-CHROME' }],
    ['SiteBrowser', 'show', {}],
    ['SiteBrowser', 'hide', {}],
    ['SiteBrowser', 'close', {}],
    ['SiteBrowser', 'addListener', { eventName: 'event' }],
    ['SiteBrowser', 'removeListener', { eventName: 'event', callbackId: 'cb-1' }]
  ]);
  assert.strictEqual(noHttp.Platform.siteBrowser, null, 'no site browser outside the app');

  // A site keeps one identity in the app; when it changes, the site's cookies (a session started
  // under the old identity) are dropped once. Before this, every site used the desktop identity.
  const idCalls = [];
  const idStore = {};
  const idEnv = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    navigator: { userAgent: PHONE_UA },
    localStorage: { getItem: (k) => (k in idStore ? idStore[k] : null), setItem: (k, v) => { idStore[k] = String(v); }, removeItem: (k) => { delete idStore[k]; } },
    Capacitor: {
      PluginHeaders: [{ name: 'SiteBrowser', methods: [] }, { name: 'CapacitorHttp', methods: [] }],
      nativePromise: async (plugin, method, options) => { idCalls.push(JSON.parse(JSON.stringify([plugin, method, options]))); return {}; }
    }
  };
  idEnv.globalThis = idEnv;
  vm.createContext(idEnv);
  vm.runInContext(platformCode, idEnv);
  const P2 = idEnv.Platform;
  assert.strictEqual(await P2.useSiteIdentity('https://sangtacviet.com/truyen/uukanshu/1/92019/1122/', 'mobile'), P2.mobileUserAgent());
  assert.deepStrictEqual(idCalls, [['SiteBrowser', 'clearCookies', { url: 'https://sangtacviet.com/' }]], 'the desktop-era session is dropped once');
  assert.strictEqual(await P2.useSiteIdentity('https://sangtacviet.com/index.php?ngmar=chapterlist', 'mobile'), P2.mobileUserAgent());
  assert.strictEqual(idCalls.length, 1, 'only when the identity changes');
  assert.strictEqual(await P2.useSiteIdentity('https://www.nkwwlkj.cn/book/book_detail/1', 'desktop'), P2.desktopUserAgent());
  assert.strictEqual(idCalls.length, 1, 'nkwwlkj kept its desktop identity: its login survives');
  await P2.useSiteIdentity('https://www.sangtacviet.com/', 'desktop');
  assert.deepStrictEqual(idCalls[1], ['SiteBrowser', 'clearCookies', { url: 'https://sangtacviet.com/' }], 'www and the bare domain are one site');
  assert.strictEqual(await noHttp.Platform.useSiteIdentity('https://sangtacviet.com/', 'mobile'), noHttp.Platform.mobileUserAgent(), 'outside the app it only names the user agent');
  siteEnv.chrome = fakeChrome().chrome;
  assert.strictEqual(siteEnv.Platform.siteBrowser, null, 'the extension uses tabs and content scripts');
  console.log('✓ App mode: SiteBrowser plugin opens, shows, hides, closes and reports page messages');

  // Keeping the screen on while reading: the app's Screen plugin, else the browser's wake lock.
  const screenCalls = [];
  const screenEnv = {
    console,
    setTimeout,
    clearTimeout,
    Capacitor: {
      PluginHeaders: [{ name: 'Screen', methods: [] }],
      nativePromise: async (plugin, method, options) => { screenCalls.push(JSON.parse(JSON.stringify([plugin, method, options]))); return {}; }
    }
  };
  screenEnv.globalThis = screenEnv;
  vm.createContext(screenEnv);
  vm.runInContext(platformCode, screenEnv);
  assert.strictEqual(await screenEnv.Platform.screen.keepAwake(true), true);
  assert.strictEqual(await screenEnv.Platform.screen.keepAwake(false), true);
  assert.deepStrictEqual(screenCalls, [['Screen', 'keepOn', { on: true }], ['Screen', 'keepOn', { on: false }]]);

  const lockLog = [];
  const lockListeners = {};
  const lockEnv = {
    console,
    setTimeout,
    clearTimeout,
    document: {
      visibilityState: 'visible',
      addEventListener: (type, fn) => { lockListeners[type] = fn; },
      removeEventListener: (type) => { delete lockListeners[type]; }
    },
    navigator: {
      wakeLock: {
        async request(type) {
          lockLog.push(['request', type]);
          return { released: false, async release() { this.released = true; lockLog.push(['release']); } };
        }
      }
    }
  };
  lockEnv.globalThis = lockEnv;
  vm.createContext(lockEnv);
  vm.runInContext(platformCode, lockEnv);
  assert.strictEqual(await lockEnv.Platform.screen.keepAwake(true), true);
  await lockListeners.visibilitychange();
  assert.deepStrictEqual(lockLog, [['request', 'screen'], ['request', 'screen']], 'the browser drops the lock when hidden, so it is taken again on return');
  assert.strictEqual(await lockEnv.Platform.screen.keepAwake(false), true);
  assert.strictEqual(lockLog[lockLog.length - 1][0], 'release');
  assert.strictEqual(lockListeners.visibilitychange, undefined, 'stops re-taking it');

  const noScreen = { console, setTimeout, clearTimeout };
  noScreen.globalThis = noScreen;
  vm.createContext(noScreen);
  vm.runInContext(platformCode, noScreen);
  assert.strictEqual(await noScreen.Platform.screen.keepAwake(true), false, 'nothing to keep the screen on with');

  const screenPlugin = fs.readFileSync(path.join(repoRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'quickconverter', 'app', 'ScreenPlugin.java'), 'utf8');
  assert(/@CapacitorPlugin\(name = "Screen"\)/.test(screenPlugin) && /FLAG_KEEP_SCREEN_ON/.test(screenPlugin), 'the Screen plugin holds the screen on');
  assert(/registerPlugin\(ScreenPlugin\.class\)/.test(fs.readFileSync(path.join(repoRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'quickconverter', 'app', 'MainActivity.java'), 'utf8')), 'registered');
  console.log('✓ Keeping the screen on: the app plugin, else the browser wake lock');

  // Downloads keep running with the app in the background through the app's foreground service.
  const bgCalls = [];
  const bgEnv = {
    console,
    setTimeout,
    clearTimeout,
    Capacitor: {
      PluginHeaders: [{ name: 'BackgroundWork', methods: [] }],
      nativePromise: async (plugin, method, options) => { bgCalls.push(JSON.parse(JSON.stringify([plugin, method, options]))); return {}; }
    }
  };
  bgEnv.globalThis = bgEnv;
  vm.createContext(bgEnv);
  vm.runInContext(platformCode, bgEnv);
  await bgEnv.Platform.background.hold('Downloading Regressor · Chapter 7');
  await bgEnv.Platform.background.release();
  assert.deepStrictEqual(bgCalls, [
    ['BackgroundWork', 'hold', { text: 'Downloading Regressor · Chapter 7' }],
    ['BackgroundWork', 'release', {}]
  ]);
  bgCalls.length = 0;
  await bgEnv.Platform.background.hold('Downloading Regressor · Chapter 7', 'downloads');
  await bgEnv.Platform.background.hold('Syncing library…', 'sync');
  await bgEnv.Platform.background.release('sync');
  await bgEnv.Platform.background.release('downloads');
  assert.deepStrictEqual(bgCalls, [
    ['BackgroundWork', 'hold', { text: 'Downloading Regressor · Chapter 7' }],
    ['BackgroundWork', 'hold', { text: 'Syncing library…' }],
    ['BackgroundWork', 'hold', { text: 'Downloading Regressor · Chapter 7' }],
    ['BackgroundWork', 'release', {}]
  ], 'downloads and sync share the notification; it ends only when neither needs it');
  assert.strictEqual(noScreen.Platform.background, null, 'no background work outside the app');
  bgEnv.chrome = fakeChrome().chrome;
  assert.strictEqual(bgEnv.Platform.background, null, 'the extension has its own service worker');

  const javaDir = path.join(repoRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'quickconverter', 'app');
  const bgPlugin = fs.readFileSync(path.join(javaDir, 'BackgroundWorkPlugin.java'), 'utf8');
  assert(/@CapacitorPlugin\(name = "BackgroundWork"\)/.test(bgPlugin), 'BackgroundWork plugin');
  for (const method of ['hold', 'release']) {
    assert(new RegExp(`@PluginMethod\\s+public void ${method}\\(PluginCall call\\)`).test(bgPlugin), `has ${method}()`);
  }
  assert(/POST_NOTIFICATIONS/.test(bgPlugin), 'asks to show its notification (Android 13+)');
  const service = fs.readFileSync(path.join(javaDir, 'DownloadService.java'), 'utf8');
  assert(/extends Service/.test(service) && /FOREGROUND_SERVICE_TYPE_DATA_SYNC/.test(service), 'a dataSync foreground service');
  assert(/onTaskRemoved/.test(service) && /onTimeout/.test(service), 'stops when the app is swiped away or Android ends its time');
  const activity = fs.readFileSync(path.join(javaDir, 'MainActivity.java'), 'utf8');
  assert(/registerPlugin\(BackgroundWorkPlugin\.class\)/.test(activity), 'registered');
  assert(/setRendererPriorityPolicy\(WebView\.RENDERER_PRIORITY_IMPORTANT, false\)/.test(activity), 'the page renderer keeps the app\'s priority in the background');
  const manifestXml = fs.readFileSync(path.join(repoRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  for (const permission of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_DATA_SYNC', 'POST_NOTIFICATIONS']) {
    assert(manifestXml.includes(`android.permission.${permission}"`), `declares ${permission}`);
  }
  assert(/<service[^>]*android:name="\.DownloadService"[^>]*android:foregroundServiceType="dataSync"/.test(manifestXml) || /<service[^>]*android:foregroundServiceType="dataSync"[^>]*android:name="\.DownloadService"/.test(manifestXml), 'declares the service');
  console.log('✓ App mode: background downloads hold a foreground service');

  // Android back button and leaving the app go through @capacitor/app.
  const shellCalls = [];
  let backCallback = null;
  const shellCap = {
    PluginHeaders: [{ name: 'App', methods: [] }],
    nativeCallback: (plugin, method, options, callback) => {
      shellCalls.push(JSON.parse(JSON.stringify([plugin, method, options])));
      backCallback = callback;
      return 'cb-1';
    },
    nativePromise: async (plugin, method, options) => {
      shellCalls.push(JSON.parse(JSON.stringify([plugin, method, options])));
      return {};
    }
  };
  const shellEnv = { console, setTimeout, clearTimeout, Capacitor: shellCap };
  shellEnv.globalThis = shellEnv;
  vm.createContext(shellEnv);
  vm.runInContext(platformCode, shellEnv);
  const presses = [];
  const stopBack = shellEnv.Platform.runtime.onBackButton((info) => presses.push(JSON.parse(JSON.stringify(info))));
  assert.deepStrictEqual(shellCalls, [['App', 'addListener', { eventName: 'backButton' }]]);
  backCallback({ canGoBack: true });
  backCallback(null);
  assert.deepStrictEqual(presses, [{ canGoBack: true }, { canGoBack: false }]);
  await stopBack();
  assert.deepStrictEqual(shellCalls[1], ['App', 'removeListener', { eventName: 'backButton', callbackId: 'cb-1' }]);
  assert.strictEqual(await shellEnv.Platform.runtime.minimizeApp(), true);
  assert.deepStrictEqual(shellCalls[2], ['App', 'minimizeApp', {}]);
  const noShell = { console, setTimeout, clearTimeout };
  noShell.globalThis = noShell;
  vm.createContext(noShell);
  vm.runInContext(platformCode, noShell);
  const noop = noShell.Platform.runtime.onBackButton(() => { throw new Error('never called'); });
  assert.strictEqual(typeof noop, 'function', 'still returns an unsubscribe');
  assert.strictEqual(await noShell.Platform.runtime.minimizeApp(), false, 'nothing to minimize outside the app');
  console.log('✓ App mode: back button and minimizing go through the App plugin');

  // Saving a file in the app: Android's "create document" picker, written in chunks.
  const saveCalls = [];
  let created = true;
  let failWrite = false;
  const saverCap = {
    PluginHeaders: [{ name: 'FileSaver', methods: [] }],
    nativePromise: async (plugin, method, options) => {
      saveCalls.push(JSON.parse(JSON.stringify([plugin, method, options])));
      if (method === 'begin') return { created };
      if (method === 'write' && failWrite) throw new Error('disk full');
      return {};
    }
  };
  const saverEnv = { console, setTimeout, clearTimeout, Capacitor: saverCap };
  saverEnv.globalThis = saverEnv;
  vm.createContext(saverEnv);
  vm.runInContext(platformCode, saverEnv);
  const files = saverEnv.Platform.files;
  assert.ok(files, 'the app can save files when its FileSaver plugin is present');
  const text = 'a'.repeat(5) + 'b'.repeat(5) + 'c'.repeat(2);
  assert.strictEqual(await files.saveText('backup.json', 'application/json', text, { chunkSize: 5 }), true);
  assert.deepStrictEqual(saveCalls, [
    ['FileSaver', 'begin', { fileName: 'backup.json', mimeType: 'application/json' }],
    ['FileSaver', 'write', { text: 'aaaaa' }],
    ['FileSaver', 'write', { text: 'bbbbb' }],
    ['FileSaver', 'write', { text: 'cc' }],
    ['FileSaver', 'finish', {}]
  ]);
  saveCalls.length = 0;
  created = false;
  assert.strictEqual(await files.saveText('backup.json', 'application/json', text), false, 'picker cancelled');
  assert.deepStrictEqual(saveCalls.map((c) => c[1]), ['begin'], 'nothing is written after a cancel');
  saveCalls.length = 0;
  created = true;
  failWrite = true;
  await assert.rejects(() => files.saveText('backup.json', 'application/json', text), /disk full/);
  assert.deepStrictEqual(saveCalls.map((c) => c[1]), ['begin', 'write', 'abort'], 'a failed save removes the half-written file');
  assert.strictEqual(noShell.Platform.files, null, 'no FileSaver plugin: the page downloads instead');
  console.log('✓ App mode: files are saved through the FileSaver plugin in chunks');

  const capConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'capacitor.config.json'), 'utf8'));
  assert.strictEqual(capConfig.plugins.SystemBars && capConfig.plugins.SystemBars.style, 'DARK', 'light status bar icons on the dark app');
  const androidRes = path.join(repoRoot, 'android', 'app', 'src', 'main', 'res', 'values');
  const colors = fs.readFileSync(path.join(androidRes, 'colors.xml'), 'utf8');
  assert(/<color name="qc_background">#0f172a<\/color>/i.test(colors), 'app background is slate-900 like the pages');
  const styles = fs.readFileSync(path.join(androidRes, 'styles.xml'), 'utf8');
  const appTheme = styles.match(/<style name="AppTheme\.NoActionBar"[\s\S]*?<\/style>/);
  assert(appTheme && /name="android:windowBackground">@color\/qc_background</.test(appTheme[0]), 'status and gesture bar areas match the pages');
  const mainActivity = fs.readFileSync(path.join(repoRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'quickconverter', 'app', 'MainActivity.java'), 'utf8');
  assert(/registerPlugin\(FileSaverPlugin\.class\)/.test(mainActivity) && /registerPlugin\(GoogleAuthPlugin\.class\)/.test(mainActivity), 'app plugins are registered');
  assert(JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).dependencies['@capacitor/app'], '@capacitor/app provides the back button');
  for (const view of ['library', 'novel', 'reader', 'settings']) {
    const entry = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'react', view, `${view}-entry.jsx`), 'utf8');
    assert(/installBackButton\(/.test(entry), `${view} handles the Android back button`);
  }
  console.log('✓ Android shell: dark system bars, plugins registered, every app page handles Back');

  // Persistent storage: the app asks Android not to evict its library; the extension already has unlimitedStorage.
  const persistCalls = [];
  const appEnv = { console, setTimeout, clearTimeout, navigator: { storage: { persist: async () => { persistCalls.push('persist'); return true; } } } };
  appEnv.globalThis = appEnv;
  vm.createContext(appEnv);
  vm.runInContext(platformCode, appEnv);
  assert.strictEqual(await appEnv.Platform.runtime.requestPersistentStorage(), true);
  assert.deepStrictEqual(persistCalls, ['persist']);
  appEnv.chrome = fakeChrome().chrome;
  assert.strictEqual(await appEnv.Platform.runtime.requestPersistentStorage(), false, 'not needed in the extension');
  assert.deepStrictEqual(persistCalls, ['persist'], 'the extension never asks');
  const bare = { console, setTimeout, clearTimeout };
  bare.globalThis = bare;
  vm.createContext(bare);
  vm.runInContext(platformCode, bare);
  assert.strictEqual(await bare.Platform.runtime.requestPersistentStorage(), false, 'no Storage API: nothing to ask');

  const startup = { console, setTimeout, clearTimeout, navigator: { storage: { persist: async () => { persistCalls.push('startup'); return true; } } } };
  startup.globalThis = startup;
  startup.window = startup;
  vm.createContext(startup);
  vm.runInContext(platformCode, startup);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'storage.js'), 'utf8'), startup);
  assert.strictEqual(persistCalls.filter((c) => c === 'startup').length, 1, 'the app asks once when its storage service starts');
  console.log('✓ Persistent storage is requested once in the app, never in the extension');

  for (const view of ['library', 'novel', 'popup', 'reader', 'settings', 'ocr-panel']) {
    const html = fs.readFileSync(path.join(repoRoot, 'src', 'views', `${view}.html`), 'utf8');
    const services = [...html.matchAll(/<script src="\.\.\/services\/([^"]+)"><\/script>/g)].map((m) => m[1]);
    assert.strictEqual(services[0], 'platform.js', `${view}.html must load services/platform.js before any other service`);
    assert.strictEqual(services.filter((s) => s === 'platform.js').length, 1, `${view}.html loads platform.js once`);
  }
  const worker = fs.readFileSync(path.join(repoRoot, 'extension', 'scripts', 'background.js'), 'utf8').match(/importScripts\(([^)]*)\)/)[1];
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

  // --- Build targets: the extension and the app share src/, extension-only files live in extension/ ---
  const { pathToFileURL } = require('url');
  const targets = await import(pathToFileURL(path.join(repoRoot, 'build-targets.mjs')).href);
  const ext = targets.buildTarget('extension');
  const app = targets.buildTarget('app');
  assert.strictEqual(ext.outDir, '../dist');
  assert.strictEqual(app.outDir, '../dist-app');
  assert.deepStrictEqual(Object.keys(ext.inputs).sort(), ['library', 'novel', 'ocr', 'opentosave', 'popup', 'reader', 'settings']);
  assert.deepStrictEqual(Object.keys(app.inputs).sort(), ['library', 'novel', 'reader', 'settings'], 'the app has no popup, site OCR panel or Open-to-save hand-off page');
  const copiedTo = (target) => target.copies.map(([, to]) => to);
  for (const dir of ['providers', 'services', 'styles', 'fonts', 'icons', 'ocr', 'dict']) {
    assert(copiedTo(ext).includes(`dist/${dir}`), `the extension gets ${dir}`);
    assert(copiedTo(app).includes(`dist-app/${dir}`), `the app gets ${dir}`);
  }
  assert.deepStrictEqual(
    ext.copies.filter(([from]) => from.startsWith('extension/')).map((pair) => pair.join(' -> ')).sort(),
    ['extension/manifest.json -> dist/manifest.json', 'extension/rules -> dist/rules', 'extension/scripts -> dist/scripts'],
    'extension-only files land where the extension expects them'
  );
  assert(!app.copies.some(([from]) => from.startsWith('extension/')), 'nothing extension-only goes into the app');
  assert(/url=views\/library\.html/.test(app.files['index.html'] || ''), 'the app starts on the library');
  assert(/location\.replace\(['"]views\/library\.html['"]\)/.test(app.files['index.html'] || ''), 'the start page leaves no history entry, so Back never lands on it');
  assert.deepStrictEqual(Object.keys(ext.files), [], 'the extension needs no generated start page');
  assert.throws(() => targets.buildTarget('nope'), /unknown build target/i);
  for (const moved of ['manifest.json', 'scripts/background.js', 'scripts/content.js', 'scripts/open-to-save-page.js', 'rules/sangtacviet.json']) {
    assert(fs.existsSync(path.join(repoRoot, 'extension', moved)), `extension/${moved} exists`);
  }
  assert(!fs.existsSync(path.join(repoRoot, 'manifest' + '.json')) && !fs.existsSync(path.join(repoRoot, 'src', 'scripts')) && !fs.existsSync(path.join(repoRoot, 'src', 'rules')), 'no leftovers at the old places');
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.scripts['build:app'], 'vite build --mode app');
  assert(/buildTarget\(/.test(fs.readFileSync(path.join(repoRoot, 'vite.config.mjs'), 'utf8')), 'vite.config.mjs builds from build-targets.mjs');
  console.log('✓ Build targets: extension -> dist/, app -> dist-app/ without extension-only files');

  console.log('🎉 Platform Test Suite: ALL TESTS PASSED!');
})().catch((err) => {
  console.error('✗ Platform test failed:', err.message);
  process.exit(1);
});
