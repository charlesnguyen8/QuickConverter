// QuickConverter - Sáng Tác Việt (sangtacviet.com) Site Provider Adapter
// Open-page-only provider: the site is protected against crawlers, so chapters are never
// fetched in the background. Chapter text is read from the chapter page the user opens:
// the site renders its own Vietnamese conversion, and every converted word keeps its
// original Chinese in a `t` attribute, which is what we save. The catalog comes from the
// same chapter-list request the book page makes, and book details from the book page.

const SangtacvietProvider = (() => {
  const ORIGIN = 'https://sangtacviet.com';
  const PATH = /^\/truyen\/([a-z0-9_]+)\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/i;
  const CJK = /[⺀-鿿豈-﫿＀-￯　-〿“”‘’]/u;
  const PUNCTUATION = { ',': '，', '.': '。', '?': '？', '!': '！', ':': '：', ';': '；' };
  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

  function decodeEntities(text) {
    return String(text || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      const named = ENTITIES[code.toLowerCase()];
      return named !== undefined ? named : m;
    });
  }

  function cleanText(html) {
    return decodeEntities(String(html || '').replace(/<[^>]+>/g, ''))
      .replace(/[\s　]+/g, ' ')
      .trim();
  }

  function docHtml(doc) {
    if (!doc) return '';
    if (doc.documentElement && typeof doc.documentElement.outerHTML === 'string') {
      return doc.documentElement.outerHTML;
    }
    return '';
  }

  function slugFor(host, bookId) {
    return `${host}-${bookId}`;
  }

  function splitSlug(slug) {
    const text = String(slug || '');
    const cut = text.lastIndexOf('-');
    if (cut <= 0 || cut === text.length - 1) return null;
    return { host: text.slice(0, cut), bookId: text.slice(cut + 1) };
  }

  function bookUrl(host, segment, bookId) {
    return `${ORIGIN}/truyen/${host}/${segment}/${bookId}/`;
  }

  function seriesUrlFor(slug, seriesUrl) {
    if (seriesUrl) return seriesUrl.endsWith('/') ? seriesUrl : `${seriesUrl}/`;
    const parts = splitSlug(slug);
    return parts ? bookUrl(parts.host, '1', parts.bookId) : null;
  }

  function meta(src, property) {
    const re = new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']*)["']`, 'i');
    const found = src.match(re);
    return found ? cleanText(found[1]) : '';
  }

  function parseBookInfo(src) {
    const found = src.match(/var\s+bookinfo\s*=\s*(\{[\s\S]*?\});/);
    if (!found) return null;
    try {
      return JSON.parse(found[1]);
    } catch (e) {
      return null;
    }
  }

  function parseSeriesHtml(html) {
    const src = String(html || '');
    const info = parseBookInfo(src) || {};
    const heading = src.match(/id=["']book_name2["'][^>]*>([\s\S]*?)<\/h1>/i);
    const title = cleanText(info.namevi) || meta(src, 'og:novel:book_name') || (heading ? cleanText(heading[1]) : '');
    const count = src.match(/<title>[^<]*?-\s*(\d+)\s*chương\s*<\/title>/i);
    const status = meta(src, 'og:novel:status');
    return {
      title,
      totalChapters: count ? Number(count[1]) : null,
      thumbnail: info.thumb ? String(info.thumb) : null,
      author: meta(src, 'og:novel:author') || (info.author ? String(info.author) : null),
      status: /hoàn thành|hoàn tất|full/i.test(status) ? 'Completed' : (status ? 'Ongoing' : 'Active')
    };
  }

  function parseChapterList(data, seriesUrl) {
    const base = seriesUrlFor('', seriesUrl);
    const entries = String(data || '').split('-//-').map((entry) => entry.split('-/-')).filter((parts) => parts.length >= 3 && parts[1].trim());
    const first = entries.length ? Number(entries[0][1].trim()) : NaN;
    const last = entries.length ? Number(entries[entries.length - 1][1].trim()) : NaN;
    const newestFirst = Number.isFinite(first) && Number.isFinite(last) ? first > last : true;
    const ordered = newestFirst ? entries.slice().reverse() : entries;
    return ordered.map((parts, i) => {
      const id = parts[1].trim();
      const titleParts = parts.length > 3 && parts[parts.length - 1].trim().toLowerCase() === 'vip' ? parts.slice(2, -1) : parts.slice(2);
      const title = titleParts.join('-/-').replace(/\s+/g, ' ').trim();
      return {
        chapterNumber: i + 1,
        title: title || `Chapter ${i + 1}`,
        slug: id,
        url: base ? `${base}${id}/` : ''
      };
    });
  }

  function contentBoxHtml(src) {
    const open = /<div[^>]*\bid=["']cld-[^"']*["'][^>]*>/i.exec(src);
    if (!open) return null;
    const start = open.index + open[0].length;
    const end = src.indexOf('</div>', start);
    return end === -1 ? null : src.slice(start, end);
  }

  function tidyLine(line) {
    const chars = Array.from(line.trim());
    let out = '';
    chars.forEach((ch, i) => {
      if (!/\s/.test(ch)) {
        out += ch;
        return;
      }
      const prev = out.slice(-1);
      const next = chars.slice(i + 1).find((c) => !/\s/.test(c)) || '';
      if (!prev || !next || CJK.test(prev) || CJK.test(next) || out.endsWith(' ')) return;
      out += ' ';
    });
    return out;
  }

  // Text the site left unconverted (between words, or in its "exran" tokens) has its
  // punctuation turned into ASCII; turn it back, except inside Latin words, numbers and
  // web addresses (3.5, www.example.com).
  function restorePunctuation(plainText, before) {
    const inWord = (ch) => /[A-Za-z0-9]/.test(ch || '');
    return Array.from(plainText).map((ch, i, all) => {
      const mapped = PUNCTUATION[ch];
      if (!mapped) return ch;
      return inWord(i > 0 ? all[i - 1] : before.slice(-1)) && inWord(all[i + 1]) ? ch : mapped;
    }).join('');
  }

  function chineseFromContent(boxHtml) {
    const body = String(boxHtml || '').replace(/<span\b[\s\S]*?<\/span>/gi, '');
    const token = /<br\s*\/?>|<i\b([^>]*)>[\s\S]*?<\/i>|<[^>]+>|([^<]+)/gi;
    let text = '';
    let words = 0;
    let m;
    while ((m = token.exec(body)) !== null) {
      if (/^<br/i.test(m[0])) {
        text += '\n';
      } else if (m[1] !== undefined) {
        const t = m[1].match(/\bt=["']([^"']*)["']/i);
        if (t) {
          const chinese = decodeEntities(t[1]);
          const extra = /\bid=["']exran/i.test(m[1]);
          if (chinese.trim() && !extra) words += 1;
          text += extra ? restorePunctuation(chinese, text) : chinese;
        }
      } else if (m[2] !== undefined) {
        text += restorePunctuation(decodeEntities(m[2]), text);
      }
    }
    if (words === 0) return null;
    const paragraphs = text.split('\n').map(tidyLine).filter(Boolean);
    return paragraphs.length > 0 ? paragraphs.join('\n\n') : null;
  }

  function parseChapterPageHtml(html) {
    const src = String(html || '');
    const titleMatch = src.match(/id=["']bookchapnameholder["'][^>]*>([\s\S]*?)<\/center>/i);
    const novelMatch = src.match(/id=["']booknameholder["'][^>]*>([\s\S]*?)<\/a>/i);
    return {
      title: titleMatch ? cleanText(titleMatch[1]) : '',
      novelTitle: novelMatch ? cleanText(novelMatch[1]) : '',
      rawText: chineseFromContent(contentBoxHtml(src))
    };
  }

  function mainContentText(src) {
    const open = /<div[^>]*\bid=["']maincontent["'][^>]*>/i.exec(String(src || ''));
    if (!open) return '';
    const start = open.index + open[0].length;
    const end = src.indexOf('</div>', start);
    return cleanText(src.slice(start, end === -1 ? undefined : end));
  }

  function siteMessage(text) {
    return String(text || '').split('\n')[0].replace(/\s+/g, ' ').trim();
  }

  function classifyMessage(message) {
    if (/chương vip/i.test(message) && /chưa thể tải/i.test(message)) {
      return { outcome: 'skip', reason: `VIP chapter the site cannot load: ${message}` };
    }
    if (/chương không tồn tại/i.test(message)) {
      return { outcome: 'skip', reason: `The site says this chapter does not exist: ${message} Sync Catalog to refresh the chapter list.` };
    }
    const code = /mã báo lỗi\s*:\s*(\d+)/i.exec(message);
    if (code && /^400\d$/.test(code[1])) {
      return { outcome: 'blocked', reason: `Sáng Tác Việt refused to load chapters in this browser (error ${code[1]}).` };
    }
    if (/tải quá thời gian/i.test(message)) {
      return { outcome: 'retry', reason: 'Sáng Tác Việt timed out loading the chapter.' };
    }
    return null;
  }

  function classifyPage({ document: doc, alerts = [], final = false } = {}) {
    const src = docHtml(doc);
    if (contentBoxHtml(src) && chineseFromContent(contentBoxHtml(src))) return null;
    const main = mainContentText(src);
    const messages = [main, ...(alerts || []).map(siteMessage)].filter(Boolean);
    for (const message of messages) {
      const outcome = classifyMessage(message);
      if (outcome && (final || outcome.outcome !== 'blocked')) return outcome;
    }
    if (!final) return null;
    const alert = (alerts || []).map(siteMessage).find(Boolean);
    if (alert) return { outcome: 'needs-user', reason: `Sáng Tác Việt says: ${alert}` };
    if (/Nhấp vào để tải chương/i.test(main)) {
      return { outcome: 'needs-user', reason: 'The chapter is waiting for a tap ("Nhấp vào để tải chương…"). Tap it on the page.' };
    }
    return null;
  }

  function nativeHttp() {
    const platform = typeof Platform !== 'undefined' ? Platform : null;
    return platform && platform.http ? platform.http : null;
  }

  async function fetchText(url, headers) {
    const http = nativeHttp();
    if (http) {
      const userAgent = typeof Platform.useSiteIdentity === 'function' ? await Platform.useSiteIdentity(url, 'mobile') : null;
      const reply = await http.getText(url, { headers: { ...(userAgent ? { 'User-Agent': userAgent } : {}), ...(headers || {}) } });
      return reply.ok ? reply.text : null;
    }
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) return null;
    return resp.text();
  }

  return {
    id: 'sangtacviet',
    name: 'Sáng Tác Việt (sangtacviet.com)',
    shortName: 'Sáng Tác Việt',
    domains: ['sangtacviet.com', 'www.sangtacviet.com'],
    contentWaitMs: 20000,
    appUserAgent: 'mobile',
    fetchMode: 'page',

    matches(url) {
      if (!url) return false;
      try {
        return this.domains.includes(new URL(url).hostname);
      } catch (e) {
        return false;
      }
    },

    shouldAutoOpenPopup(urlStr) {
      const info = this.parseUrl(urlStr);
      return !!info && info.type === 'series';
    },

    parseUrl(urlStr) {
      if (!this.matches(urlStr)) return null;
      try {
        const { pathname } = new URL(urlStr);
        const found = pathname.match(PATH);
        if (found) {
          const [, host, segment, bookId, chapterId] = found;
          const seriesUrl = bookUrl(host, segment, bookId);
          const slug = slugFor(host, bookId);
          if (chapterId) {
            return { type: 'chapter', slug, chapterSlug: chapterId, chapterNumber: null, url: urlStr, seriesUrl };
          }
          return { type: 'series', slug, chapterNumber: null, url: urlStr, seriesUrl };
        }
        if (pathname === '/' || pathname === '') {
          return { type: 'home', slug: null, chapterNumber: null, url: urlStr };
        }
        return { type: 'other', slug: null, chapterNumber: null, url: urlStr };
      } catch (e) {
        return null;
      }
    },

    parseSeriesHtml,
    parseChapterList,
    parseChapterPageHtml,
    classifyPage,

    extractSeriesMetadata(doc) {
      return parseSeriesHtml(docHtml(doc));
    },

    extractChapterInfo(doc, chapterNumber) {
      const page = parseChapterPageHtml(docHtml(doc));
      if (!page.rawText) return null;
      return {
        chapterNumber,
        title: page.title || `Chapter ${chapterNumber}`,
        novelTitle: page.novelTitle,
        rawText: page.rawText
      };
    },

    async fetchSeriesMetadata(slug, seriesUrl) {
      const url = seriesUrlFor(slug, seriesUrl);
      if (!url) return null;
      try {
        const html = await fetchText(url);
        if (!html) return null;
        const metadata = parseSeriesHtml(html);
        return metadata.title ? metadata : null;
      } catch (e) {
        console.warn('[sangtacviet Provider] Error fetching book details:', e);
        return null;
      }
    },

    async fetchChapterList(slug, seriesUrl) {
      const parts = splitSlug(slug);
      if (!parts) return [];
      const query = new URLSearchParams({ ngmar: 'chapterlist', h: parts.host, bookid: parts.bookId, sajax: 'getchapterlist' });
      try {
        const body = await fetchText(`${ORIGIN}/index.php?${query.toString()}`, { Referer: `${ORIGIN}/` });
        if (!body) return [];
        const json = JSON.parse(body);
        if (!json || Number(json.code) !== 1) return [];
        return parseChapterList(json.data, seriesUrlFor(slug, seriesUrl));
      } catch (e) {
        console.warn('[sangtacviet Provider] Could not load the chapter list (open the book page and try again):', e);
        return [];
      }
    },

    formatTitle(slug, rawTitle) {
      const cleaned = String(rawTitle || '').replace(/\s*-\s*\d+\s*chương\s*$/i, '').trim();
      return cleaned || (slug ? `Book ${slug}` : '');
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SangtacvietProvider;
}
if (typeof globalThis !== 'undefined') {
  globalThis.SangtacvietProvider = SangtacvietProvider;
}
