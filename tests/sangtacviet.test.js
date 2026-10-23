const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('\n--- Running sangtacviet.com Provider Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

function loadEnv(extra = {}) {
  const env = {
    console: { log() {}, warn() {}, error() {} },
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    ...extra
  };
  env.window = env;
  env.self = env;
  env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(read('src', 'providers', 'wetriedtls.js'), env);
  vm.runInContext(read('src', 'providers', 'nkwwlkj.js'), env);
  vm.runInContext(read('src', 'providers', 'sangtacviet.js'), env);
  vm.runInContext(read('src', 'providers', 'registry.js'), env);
  return env;
}

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

const BOOK_URL = 'https://sangtacviet.com/truyen/uukanshu/1/92019/';
const CHAPTER_URL = 'https://sangtacviet.com/truyen/uukanshu/1/92019/1122/';

// Trimmed from the real book page's server HTML.
const BOOK_HTML = `<!DOCTYPE html><html><head>
<title>Ta mới không cần yêu nhau trò chơi - 450 chương</title>
<meta property="og:novel:category" content=" Nhị thứ nguyên tiểu thuyết "/>
<meta property="og:novel:author" content="Xích gian huỳnh hỏa"/>
<meta property="og:novel:book_name" content="Ta mới không cần yêu nhau trò chơi"/>
<meta property="og:novel:status" content="Còn tiếp"/>
</head><body>
<img id="thumb-prop" alt="Ta mới kh&ocirc;ng cần y&ecirc;u nhau tr&ograve; chơi" referrerpolicy="no-referrer" src="">
<h1 id="book_name2" class="cap">Ta mới không cần yêu nhau trò chơi</h1>
<script type="text/javascript"> var thispage='list'; var bookstep=3; var bookinfo = {"id":"92019","lid":"270022","host":"uukanshu","name":"\\u6211\\u624d\\u4e0d\\u8981\\u604b\\u7231\\u6e38\\u620f","thumb":"https:\\/\\/img.uukanshu.com\\/fengmian\\/2019\\/2\\/636866683465774354.jpg","namevi":" Ta m\\u1edbi kh\\u00f4ng c\\u1ea7n y\\u00eau nhau tr\\u00f2 ch\\u01a1i ","lastupdate":"2022-03-27 01:55:02","author":"\\u5c3a\\u95f4\\u8424\\u706b"}; </script>
<span class="rd-tag"> uukanshu <span id="noofchapter">0</span> chapter</span>
</body></html>`;

// Same shape as index.php?ngmar=chapterlist&...&sajax=getchapterlist; this source lists newest first.
const CHAPTER_LIST_JSON = JSON.stringify({
  code: 1,
  data: [
    '1-/-62185-/- Sách mới ——《 Trùng sinh Tiên Tôn là bạn gái 》',
    '1-/-1123-/- Thứ 2 chương Bị phú bà đâm chết   ',
    '1-/-1122-/- Thứ 1 chương Ngươi chính là kêu gọi ta  phú bà sao?\n'
  ].join('-//-')
});

// Trimmed from the saved chapter page (sangtacviethtml.html).
const CONTENT_BOX = '<div class="contentbox" style="font-family: helvetica;" id="cld-92019-1122" cid="1122" user="327475">'
  + '<span style="color:gray;font-size:12px;">@Bạn đang đọc bản lưu trong hệ thống</span><br><br>'
  + '<i id="exran0" h="\t" t="\t" onclick="pr(this);">\t</i><br><br>'
  + '  “<i h="tiểu tả" t="小姐" v="tiểu thư" p="nr" id="ran0">Tiểu thư</i>, <i h="khả dĩ" t="可以" v="có thể" p="c" id="ran1">có thể</i> '
  + '<i h="thỉnh nâm" t="请您" v="xin ngài" p="v" id="ran2">xin ngài</i> <i h="nhượng cá tọa" t="让个座" v="nhường một chỗ" p="" id="ran3">nhường một chỗ</i> '
  + '<i h="mạ" t="吗" v="sao" p="y" id="ran4">sao</i>?” <br><br>'
  + '<i h="địa thiết" t="地铁" v="tàu điện ngầm" p="n" id="ran5">Tàu điện ngầm</i> <i h="thượng" t="上" v="bên trên" p="f" id="ran6">bên trên</i>, '
  + '<i h="nhất cá" t="一个" v="một cái" p="m" id="ran7">một cái</i> <i h="công tác nhân viên" t="工作人员" v="nhân viên công tác" p="n" id="ran8">nhân viên công tác</i> '
  + '<i h="thuyết" t="说" v="nói" p="v" id="ran18">nói</i>.<br><br>'
  + '  “<i h="bão khiểm" t="抱歉" v="xin lỗi" p="v" id="ran19">Xin lỗi</i>, <i h="ngã" t="我" v="ta" p="r" id="ran20">ta</i>……”<br><br>'
  + '<i h="" t="iPhone" v="" p="" id="ran21">iPhone</i> <i h="" t="&quot;3&quot;" v="" p="" id="ran22">"3"</i> <i h="hào" t="号" v="hào" p="" id="ran23">hào</i><br><br>'
  + '<i h="dam giới" t="尴尬" v="lúng túng" p="a" id="ran648">lúng túng</i> <i h="trứ" t="着" v="lấy" p="uz" id="ran649">lấy</i>'
  + '<i id="exran2" h=", UU " t=", UU " onclick="pr(this);">, UUKANSHU </i><i h="khán thư" t="看书" v="đọc sách" p="v" id="ran650">đọc sách</i>'
  + '<i id="exran3" h=" www.uukanshu.com " t=" www.uukanshu.com " onclick="pr(this);"> www.uukanshu.com </i>'
  + '<i h="lập tức" t="立即" v="lập tức" p="" id="ran651">lập tức</i>.'
  + '</div>';
const CHAPTER_HTML = '<html><head><title>Thứ 1 chương - Ta mới không cần yêu nhau trò chơi</title></head><body>'
  + '<div class="contentbox" style="height: 0px; display: none;"></div>'
  + '<a href="https://sangtacviet.com/truyen/uukanshu/1/92019/" id="booknameholder"> Ta mới không cần yêu nhau trò chơi </a>'
  + '<center id="bookchapnameholder" style="color: gray">Thứ 1 chương Ngươi chính là kêu gọi ta phú bà sao? </center>'
  + '<div id="content-container" class="container">' + CONTENT_BOX + '</div>'
  + '</body></html>';
const EXPECTED_CHINESE = [
  '“小姐，可以请您让个座吗？”',
  '地铁上，一个工作人员说。',
  '“抱歉，我……”',
  'iPhone "3"号',
  '尴尬着，UU看书www.uukanshu.com立即。'
].join('\n\n');

(async () => {
  const env = loadEnv();
  const P = env.SangtacvietProvider;

  await test('provider is exported, matches the official site and is registered', () => {
    assert(P, 'SangtacvietProvider global must exist');
    assert.strictEqual(P.id, 'sangtacviet');
    assert(P.matches(BOOK_URL) && P.matches('https://www.sangtacviet.com/truyen/uukanshu/1/92019/'));
    assert(!P.matches('https://sangtacviet.vip/truyen/uukanshu/1/92019/'), 'only the official domain');
    assert.strictEqual(env.ProviderRegistry.getProviderForUrl(CHAPTER_URL).id, 'sangtacviet');
    assert.strictEqual(env.ProviderRegistry.getProviderForDomain('sangtacviet.com').id, 'sangtacviet');
  });

  await test('chapters download by opening their page', async () => {
    assert.strictEqual(P.fetchMode, 'page');
    assert.strictEqual(P.supportsBulkDownload, undefined, 'queueable like every site');
  });

  await test('parseUrl reads book and chapter pages; the slug is host-bookId', () => {
    assert.deepStrictEqual(plain(P.parseUrl(BOOK_URL)), {
      type: 'series', slug: 'uukanshu-92019', chapterNumber: null, url: BOOK_URL, seriesUrl: BOOK_URL
    });
    assert.deepStrictEqual(plain(P.parseUrl(CHAPTER_URL)), {
      type: 'chapter', slug: 'uukanshu-92019', chapterSlug: '1122', chapterNumber: null, url: CHAPTER_URL, seriesUrl: BOOK_URL
    });
    assert.strictEqual(P.parseUrl('https://sangtacviet.com/truyen/uukanshu/1/92019').type, 'series', 'trailing slash optional');
    assert.strictEqual(P.parseUrl('https://sangtacviet.com/truyen/uukanshu/1/92019/1122/#').chapterSlug, '1122');
    assert.strictEqual(P.parseUrl('https://sangtacviet.com/').type, 'home');
    assert.strictEqual(P.parseUrl('https://sangtacviet.com/search/').type, 'other');
    assert.strictEqual(P.parseUrl('https://example.com/truyen/a/1/2/'), null);
  });

  await test('parseSeriesHtml reads the Vietnamese title, author, cover, chapter count and status', () => {
    assert.deepStrictEqual(plain(P.parseSeriesHtml(BOOK_HTML)), {
      title: 'Ta mới không cần yêu nhau trò chơi',
      totalChapters: 450,
      thumbnail: 'https://img.uukanshu.com/fengmian/2019/2/636866683465774354.jpg',
      author: 'Xích gian huỳnh hỏa',
      status: 'Ongoing'
    });
    const done = P.parseSeriesHtml(BOOK_HTML.replace('content="Còn tiếp"', 'content="Hoàn thành"'));
    assert.strictEqual(done.status, 'Completed');
  });

  await test('parseChapterList puts chapters in reading order with ids, URLs and tidy Vietnamese titles', () => {
    const list = plain(P.parseChapterList(JSON.parse(CHAPTER_LIST_JSON).data, BOOK_URL));
    assert.deepStrictEqual(list, [
      { chapterNumber: 1, title: 'Thứ 1 chương Ngươi chính là kêu gọi ta phú bà sao?', slug: '1122', url: `${BOOK_URL}1122/` },
      { chapterNumber: 2, title: 'Thứ 2 chương Bị phú bà đâm chết', slug: '1123', url: `${BOOK_URL}1123/` },
      { chapterNumber: 3, title: 'Sách mới ——《 Trùng sinh Tiên Tôn là bạn gái 》', slug: '62185', url: `${BOOK_URL}62185/` }
    ]);
    assert.deepStrictEqual(plain(P.parseChapterList('', BOOK_URL)), []);
  });

  await test('parseChapterList keeps a source that lists oldest first (qidian) in reading order, and drops the vip marker from titles', () => {
    const QIDIAN_URL = 'https://sangtacviet.com/truyen/qidian/1/1047557032/';
    const data = [
      '1-/-878314492-/- Chương 1: Tốt nghiệp trong nghi thức   “Huyễn thuật ” ',
      '1-/-878515175-/- Chương 02: Đây là bực nào  lòng son dạ sắt!',
      '1-/-878514614-/- Chương 03: Mở mắt ',
      '1-/-935406276-/- Chương 60: Đánh cược -/-vip',
      '1-/-935503507-/- Chương 61: Tuyệt nhất con cừu nhỏ -/-vip\n'
    ].join('-//-');
    const list = plain(P.parseChapterList(data, QIDIAN_URL));
    assert.deepStrictEqual(list.map((c) => [c.chapterNumber, c.slug, c.title]), [
      [1, '878314492', 'Chương 1: Tốt nghiệp trong nghi thức “Huyễn thuật ”'],
      [2, '878515175', 'Chương 02: Đây là bực nào lòng son dạ sắt!'],
      [3, '878514614', 'Chương 03: Mở mắt'],
      [4, '935406276', 'Chương 60: Đánh cược'],
      [5, '935503507', 'Chương 61: Tuyệt nhất con cừu nhỏ']
    ]);
    assert.strictEqual(list[0].url, `${QIDIAN_URL}878314492/`);
  });

  await test('fetchChapterList asks the same chapter-list endpoint the book page uses, once, with the browser cookies', async () => {
    const calls = [];
    const fetchEnv = loadEnv({
      fetch: async (url, init) => { calls.push([url, init]); return { ok: true, text: async () => CHAPTER_LIST_JSON }; }
    });
    const list = await fetchEnv.SangtacvietProvider.fetchChapterList('uukanshu-92019', BOOK_URL);
    assert.strictEqual(list.length, 3);
    assert.strictEqual(list[0].slug, '1122');
    assert.strictEqual(calls.length, 1, 'one request per sync');
    const url = new URL(calls[0][0]);
    assert.strictEqual(url.origin + url.pathname, 'https://sangtacviet.com/index.php');
    assert.deepStrictEqual(Object.fromEntries(url.searchParams), { ngmar: 'chapterlist', h: 'uukanshu', bookid: '92019', sajax: 'getchapterlist' });
    assert.strictEqual(calls[0][1].credentials, 'include', 'uses the cookies the site already gave this browser');
  });

  await test('in the app, the chapter list is a native request that sends the Referer the endpoint requires', async () => {
    const fetched = [];
    const native = [];
    const identities = [];
    const appEnv = loadEnv({
      fetch: async (url) => { fetched.push(url); return { ok: true, text: async () => CHAPTER_LIST_JSON }; },
      Platform: {
        http: { async getText(url, init) { native.push([url, init]); return { ok: true, status: 200, text: url.includes('chapterlist') ? CHAPTER_LIST_JSON : BOOK_HTML }; } },
        async useSiteIdentity(url, kind) { identities.push([url, kind]); return 'PHONE-UA'; }
      }
    });
    const list = await appEnv.SangtacvietProvider.fetchChapterList('uukanshu-92019', BOOK_URL);
    assert.strictEqual(list.length, 3);
    assert.deepStrictEqual(fetched, [], 'not through fetch(), which cannot set Referer');
    assert.strictEqual(native.length, 1);
    assert.strictEqual(new URL(native[0][0]).searchParams.get('ngmar'), 'chapterlist');
    assert.deepStrictEqual(plain(native[0][1]), { headers: { 'User-Agent': 'PHONE-UA', Referer: 'https://sangtacviet.com/' } }, 'the same phone identity as the site window');
    assert.strictEqual((await appEnv.SangtacvietProvider.fetchSeriesMetadata('uukanshu-92019', BOOK_URL)).title, 'Ta mới không cần yêu nhau trò chơi');
    assert.deepStrictEqual(plain(native[1]), [BOOK_URL, { headers: { 'User-Agent': 'PHONE-UA' } }], 'the book page too, never fetch() with the WebView identity');
    assert.deepStrictEqual(fetched, [], 'nothing through fetch()');
    assert.deepStrictEqual(plain(identities.map(([, kind]) => kind)), ['mobile', 'mobile']);

    const blocked = loadEnv({ Platform: { http: { async getText() { return { ok: false, status: 403, text: '<title>Just a moment...</title>' }; } } } });
    assert.deepStrictEqual(plain(await blocked.SangtacvietProvider.fetchChapterList('uukanshu-92019', BOOK_URL)), [], 'a challenge gives an empty list');
  });

  await test('the app trusts the root sangtacviet chains to (Android lacks Sectigo R46), for that site only', () => {
    const { X509Certificate } = require('crypto');
    const manifest = read('android', 'app', 'src', 'main', 'AndroidManifest.xml');
    assert(/<application[^>]*android:networkSecurityConfig="@xml\/network_security_config"/.test(manifest), 'the app uses a network security config');
    const config = read('android', 'app', 'src', 'main', 'res', 'xml', 'network_security_config.xml');
    assert(!/<base-config[\s\S]*?<trust-anchors/.test(config), 'other sites keep the system trust store only');
    const domainConfig = config.match(/<domain-config[^>]*>([\s\S]*?)<\/domain-config>/);
    assert(domainConfig, 'a per-site config');
    assert(/<domain includeSubdomains="true">sangtacviet\.com<\/domain>/.test(domainConfig[1]), 'for sangtacviet.com');
    assert(/<certificates src="system"\s*\/>/.test(domainConfig[1]), 'still trusts the system roots');
    const raw = domainConfig[1].match(/<certificates src="@raw\/([a-z0-9_]+)"\s*\/>/);
    assert(raw, 'plus a bundled root');

    const root = new X509Certificate(read('android', 'app', 'src', 'main', 'res', 'raw', `${raw[1]}.pem`));
    assert(/CN=Sectigo Public Server Authentication Root R46/.test(root.subject), root.subject);
    assert.strictEqual(root.fingerprint.replace(/:/g, ''), 'AD98F9F3E47D753B65D482B3A45217BB6EF5E438', 'the genuine R46 root');
    assert(root.verify(root.publicKey), 'self-signed root');
    const intermediate = new X509Certificate(read('tests', 'fixtures', 'zerossl-rsa-dv-ssl-ca-2.pem'));
    assert(/ZeroSSL RSA DV SSL CA 2/.test(intermediate.subject), 'the intermediate sangtacviet.com sends');
    assert(intermediate.checkIssued(root) && intermediate.verify(root.publicKey), 'the bundled root signs the site\'s intermediate');
  });

  await test('fetchChapterList and fetchSeriesMetadata give up quietly on a Cloudflare challenge or error', async () => {
    const challenge = loadEnv({ fetch: async () => ({ ok: false, status: 403, text: async () => '<title>Just a moment...</title>' }) });
    assert.deepStrictEqual(plain(await challenge.SangtacvietProvider.fetchChapterList('uukanshu-92019', BOOK_URL)), []);
    assert.strictEqual(await challenge.SangtacvietProvider.fetchSeriesMetadata('uukanshu-92019', BOOK_URL), null);
    const notJson = loadEnv({ fetch: async () => ({ ok: true, text: async () => '<html>challenge</html>' }) });
    assert.deepStrictEqual(plain(await notJson.SangtacvietProvider.fetchChapterList('uukanshu-92019', BOOK_URL)), []);
    const offline = loadEnv({ fetch: async () => { throw new Error('offline'); } });
    assert.deepStrictEqual(plain(await offline.SangtacvietProvider.fetchChapterList('uukanshu-92019', BOOK_URL)), []);
  });

  await test('fetchSeriesMetadata reads the book page', async () => {
    const calls = [];
    const fetchEnv = loadEnv({ fetch: async (url, init) => { calls.push([url, init]); return { ok: true, text: async () => BOOK_HTML }; } });
    const meta = await fetchEnv.SangtacvietProvider.fetchSeriesMetadata('uukanshu-92019', BOOK_URL);
    assert.strictEqual(meta.title, 'Ta mới không cần yêu nhau trò chơi');
    assert.strictEqual(calls[0][0], BOOK_URL);
    assert.strictEqual(calls[0][1].credentials, 'include');
  });

  await test('the chapter page gives the full original Chinese, with Chinese punctuation, not the site\'s conversion', () => {
    const page = plain(P.parseChapterPageHtml(CHAPTER_HTML));
    assert.strictEqual(page.rawText, EXPECTED_CHINESE);
    assert.strictEqual(page.title, 'Thứ 1 chương Ngươi chính là kêu gọi ta phú bà sao?');
    assert.strictEqual(page.novelTitle, 'Ta mới không cần yêu nhau trò chơi');
    assert(!/Tiểu thư|Bạn đang đọc/.test(page.rawText), 'neither the site\'s Vietnamese nor its notice is saved');
  });

  await test('classifyPage tells why a chapter page failed, from the site message or its alert', () => {
    const doc = (html) => ({ documentElement: { outerHTML: html } });
    const page = (main) => doc(`<html><body><div id="content-container"><div class="contentbox" id="maincontent">${main}</div></div></body></html>`);
    const loadingPrompt = '<center><span class="spinner-border"></span><br>\n\t\t\tNhấp vào để tải chương...\t\t</center>';
    const VIP = 'Đây là chương vip của qidian, chưa thể tải chương này. Ghi chú về chương này: Qidian vừa nâng cấp bảo mật, nhiều truyện không thể tải được, xin chờ giải pháp.';
    const MISSING = 'Hệ thống không thể tải chương này do bạn mở 1 chương không tồn tại, hãy thử cập nhật danh sách chương trước.';
    const BLOCKED = 'Lỗi không xác định, vui lòng thử lại sau, mã báo lỗi:4008.';
    const of = (args) => plain(P.classifyPage(args));

    assert.strictEqual(P.classifyPage({ document: doc(CHAPTER_HTML), alerts: [] }), null, 'a loaded chapter is not a failure');
    assert.strictEqual(P.classifyPage({ document: page(loadingPrompt), alerts: [] }), null, 'still loading: wait');

    const vip = of({ document: page(VIP), alerts: [] });
    assert.strictEqual(vip.outcome, 'skip', 'a VIP chapter the site cannot load is skipped');
    assert(/VIP/.test(vip.reason) && vip.reason.includes(VIP), vip.reason);
    assert.strictEqual(of({ document: page(loadingPrompt), alerts: [`${VIP}\nhttps://sangtacviet.com/truyen/qidian/1/1/2/`] }).outcome, 'skip', 'also when only its alert was caught');

    const missing = of({ document: page(MISSING), alerts: [] });
    assert.strictEqual(missing.outcome, 'skip');
    assert(/Sync Catalog/.test(missing.reason), 'a missing chapter suggests syncing the chapter list');

    for (const code of ['4005', '4008']) {
      assert.strictEqual(P.classifyPage({ document: page(BLOCKED.replace('4008', code)), alerts: [] }), null, `error ${code} alone is not final: the site often reloads and then loads the chapter`);
      const blocked = of({ document: page(BLOCKED.replace('4008', code)), alerts: [], final: true });
      assert.strictEqual(blocked.outcome, 'blocked', `error ${code} still showing when the wait is over: the site refuses this browser`);
      assert(blocked.reason.includes(code), 'says the code');
    }
    assert.strictEqual(of({ document: page(loadingPrompt), alerts: ['Lỗi không xác định, vui lòng thử lại sau, mã báo lỗi: 4005\nhttps://x'], final: true }).outcome, 'blocked', 'from the alert too (the app wording has a space)');

    assert.strictEqual(of({ document: page('<center>Tải quá thời gian, vui lòng tải lại trang.</center>'), alerts: [] }).outcome, 'retry', 'a site timeout is retried');

    const prompt = of({ document: page(loadingPrompt), alerts: [], final: true });
    assert.strictEqual(prompt.outcome, 'needs-user', 'a load prompt that never started needs the user');
    assert(/Nhấp vào để tải chương|tap/i.test(prompt.reason), prompt.reason);

    const unknown = of({ document: page(loadingPrompt), alerts: ['Something new happened'], final: true });
    assert.strictEqual(unknown.outcome, 'needs-user', 'an unknown alert at the end needs the user');
    assert(unknown.reason.includes('Something new happened'), 'and shows its message');
    assert.strictEqual(P.classifyPage({ document: page(loadingPrompt), alerts: ['Something new happened'] }), null, 'but not before the wait is over');
  });

  await test('extractChapterInfo waits for the content: nothing until the page has rendered the text', () => {
    const doc = (html) => ({ documentElement: { outerHTML: html } });
    const info = plain(P.extractChapterInfo(doc(CHAPTER_HTML), 1));
    assert.deepStrictEqual(info, {
      chapterNumber: 1,
      title: 'Thứ 1 chương Ngươi chính là kêu gọi ta phú bà sao?',
      novelTitle: 'Ta mới không cần yêu nhau trò chơi',
      rawText: EXPECTED_CHINESE
    });
    const loading = CHAPTER_HTML.replace(CONTENT_BOX, '<div class="contentbox" id="cld-92019-1122" cid="1122"><span>Đang tải...</span></div>');
    assert.strictEqual(P.extractChapterInfo(doc(loading), 1), null);
  });

  await test('the content script saves an opened chapter in Chinese under the managed novel', async () => {
    const sent = [];
    const document = {
      documentElement: { outerHTML: CHAPTER_HTML },
      getElementById: () => null,
      createElement: () => ({ style: {} }),
      body: { appendChild() {} }
    };
    const pageEnv = {
      console: { log() {}, warn() {}, error() {} },
      URL,
      URLSearchParams,
      setTimeout,
      clearTimeout,
      MutationObserver: class { observe() {} },
      document,
      chrome: {
        runtime: {
          lastError: undefined,
          getURL: (p) => `chrome-extension://abc/${p}`,
          sendMessage: (msg, cb) => {
            sent.push(msg);
            if (msg.action === 'CHECK_CHAPTER') setTimeout(() => cb({ isManaged: true, isSaved: false, chapterNumber: 1, novelId: 'novel-9' }), 0);
            else if (cb) setTimeout(() => cb({ success: true }), 0);
          }
        }
      }
    };
    pageEnv.window = { location: { href: CHAPTER_URL }, addEventListener() {}, removeEventListener() {} };
    pageEnv.globalThis = pageEnv;
    vm.createContext(pageEnv);
    vm.runInContext(read('src', 'providers', 'sangtacviet.js'), pageEnv);
    vm.runInContext(read('src', 'providers', 'registry.js'), pageEnv);
    vm.runInContext(read('extension', 'scripts', 'content.js'), pageEnv);
    await new Promise((r) => setTimeout(r, 30));
    const check = sent.find((m) => m.action === 'CHECK_CHAPTER');
    assert(check && check.slug === 'uukanshu-92019' && check.chapterSlug === '1122', 'looks the chapter up by book and chapter id');
    const save = sent.find((m) => m.action === 'SAVE_CHAPTER');
    assert(save, 'saves the chapter');
    assert.strictEqual(save.rawText, EXPECTED_CHINESE);
    assert.strictEqual(save.chapterNumber, 1);
    assert.strictEqual(save.url, CHAPTER_URL);
  });

  await test('manifest grants the site and injects the content script on book and chapter pages', () => {
    const manifest = JSON.parse(read('extension', 'manifest.json'));
    assert(manifest.host_permissions.includes('*://sangtacviet.com/*'));
    assert(manifest.host_permissions.includes('*://*.sangtacviet.com/*'));
    const cs = manifest.content_scripts.find((c) => c.matches.some((m) => m.includes('sangtacviet.com')));
    assert(cs, 'a content script entry must match sangtacviet.com');
    assert(cs.matches.includes('*://sangtacviet.com/truyen/*') && cs.matches.includes('*://*.sangtacviet.com/truyen/*'));
    assert.deepStrictEqual(cs.js, ['providers/sangtacviet.js', 'providers/registry.js', 'services/site-page.js', 'scripts/content.js']);
  });

  await test('a Chrome request rule adds the Referer the chapter-list endpoint requires, for the extension only', async () => {
    const manifest = JSON.parse(read('extension', 'manifest.json'));
    assert(manifest.permissions.includes('declarativeNetRequestWithHostAccess'), 'uses the host access the extension already has');
    const ruleset = ((manifest.declarative_net_request || {}).rule_resources || []).find((r) => r.id === 'sangtacviet');
    assert(ruleset && ruleset.enabled === true, 'the ruleset is enabled');
    assert(/'extension\/rules'/.test(read('build-targets.mjs')), 'the extension build copies extension/rules into dist');
    const rules = JSON.parse(read('extension', ruleset.path));
    assert.strictEqual(rules.length, 1, 'one rule, nothing else is touched');
    const [rule] = rules;
    assert.deepStrictEqual(rule.action, {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://sangtacviet.com/' }]
    });
    assert.deepStrictEqual(rule.condition.excludedInitiatorDomains, ['sangtacviet.com'], 'the site\'s own requests keep their own Referer');
    assert(rule.condition.resourceTypes.includes('xmlhttprequest'), 'applies to fetch()');

    const calls = [];
    const fetchEnv = loadEnv({ fetch: async (url) => { calls.push(url); return { ok: true, text: async () => CHAPTER_LIST_JSON }; } });
    await fetchEnv.SangtacvietProvider.fetchChapterList('uukanshu-92019', BOOK_URL);
    const filter = rule.condition.urlFilter;
    assert(filter.startsWith('||'), 'anchored to the domain');
    const requested = new URL(calls[0]);
    assert(`${requested.hostname}${requested.pathname}${requested.search}`.startsWith(filter.slice(2)), `the rule ${filter} matches the request ${calls[0]}`);
  });

  await test('every view and the background worker load the provider before the registry', () => {
    const sources = ['library', 'novel', 'popup', 'reader', 'settings', 'ocr-panel'].map((v) => [`views/${v}.html`, read('src', 'views', `${v}.html`)]);
    sources.push(['scripts/background.js', read('extension', 'scripts', 'background.js')]);
    for (const [name, src] of sources) {
      const p = src.indexOf('providers/sangtacviet.js');
      const r = src.indexOf('providers/registry.js');
      assert(p >= 0, `${name} must load providers/sangtacviet.js`);
      assert(p < r, `${name} must load providers/sangtacviet.js before providers/registry.js`);
    }
  });

  console.log(`--- sangtacviet.com Provider Test Suite: ${passed}/${passed + failed} passed ---`);
  if (failed > 0) process.exit(1);
  console.log('sangtacviet.com Provider Test Suite: ALL TESTS PASSED!');
})();
