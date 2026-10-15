// QuickConverter - 独阅读 (nkwwlkj.cn) Site Provider Adapter
// Catalog-only provider: book metadata and the chapter list come from the plain book page,
// while chapter text is captured from the chapter page the user has open (after the site
// renders it). Locked chapters are flagged and never downloaded.

const NkwwlkjProvider = (() => {
  const ORIGIN = 'https://www.nkwwlkj.cn';
  const bookUrl = (bookId) => `${ORIGIN}/book/book_detail/${bookId}`;
  const chapterUrl = (chapterId) => `${ORIGIN}/chapter/book_chapter_detail/${chapterId}`;

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

  function parseSeriesHtml(html) {
    const src = String(html || '');
    const titleMatch = src.match(/class=["']book-title["'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
    let title = titleMatch ? cleanText(titleMatch[1]) : '';
    if (!title) {
      const t = src.match(/<title>([\s\S]*?)<\/title>/i);
      title = t ? formatTitle('', cleanText(t[1])) : '';
    }

    const coverMatch = src.match(/<img[^>]*class=["'][^"']*book-img[^"']*["'][^>]*>/i);
    let thumbnail = null;
    if (coverMatch) {
      const dataOriginal = coverMatch[0].match(/data-original=["']([^"']+)["']/i);
      const plainSrc = coverMatch[0].match(/\ssrc=["']([^"']+)["']/i);
      thumbnail = (dataOriginal && dataOriginal[1]) || (plainSrc && !/default\.jpg$/i.test(plainSrc[1]) ? plainSrc[1] : null);
    }

    const authorMatch = src.match(/class=["']username[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
      || src.match(/<meta\s+name=["']description["']\s+content=["'][^"']*?作者([^"']+?)倾情打造/i);
    const author = authorMatch ? cleanText(authorMatch[1]) || null : null;

    let status = 'Active';
    if (/tag-lianzai/i.test(src)) status = 'Ongoing';
    if (/tag-wanjie|>\s*完结\s*</.test(src)) status = 'Completed';

    const count = (src.match(/class=["']chapter_item["']/gi) || []).length;

    return {
      title,
      totalChapters: count > 0 ? count : null,
      thumbnail,
      author,
      status
    };
  }

  function parseChapterListHtml(html) {
    const src = String(html || '');
    const token = /<div[^>]*class=["']chapter-title["'][^>]*>([\s\S]*?)<\/div>|<span[^>]*class=["']chapter_item["'][^>]*>([\s\S]*?)<\/span>/gi;
    const chapters = [];
    let volume = null;
    let m;
    while ((m = token.exec(src)) !== null) {
      if (m[1] !== undefined) {
        volume = cleanText(m[1]) || null;
        continue;
      }
      const item = m[2];
      const link = item.match(/<a[^>]*href=["'][^"']*book_chapter_detail\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!link) continue;
      const chapterNumber = chapters.length + 1;
      chapters.push({
        chapterNumber,
        title: cleanText(link[2]) || `Chapter ${chapterNumber}`,
        slug: link[1],
        url: chapterUrl(link[1]),
        locked: /class=["']lock["']/i.test(item),
        volume
      });
    }
    return chapters;
  }

  function parseChapterPageHtml(html) {
    const src = String(html || '');
    const sdBook = src.match(/book_id\s*:\s*(\d+)/);
    const sdChapter = src.match(/chapter_id\s*:\s*(\d+)/);
    const breadBook = src.match(/<a[^>]*href=["'][^"']*book\/book_detail\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);

    const titleMatch = src.match(/class=["']article-title["'][^>]*>([\s\S]*?)<\/div>/i);
    const locked = /id=["']J_ImgRead["']/i.test(src) && !/id=["']J_BookRead["']/i.test(src);

    let rawText = null;
    if (!locked) {
      const paragraphs = [];
      const pRegex = /<p\b[^>]*class=["'][^"']*\bchapter\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;
      let pm;
      while ((pm = pRegex.exec(src)) !== null) {
        const body = pm[1].replace(/<i\b[^>]*J_Num[^>]*>[\s\S]*?<\/i>/gi, '');
        const text = cleanText(body);
        if (text) paragraphs.push(text);
      }
      if (paragraphs.length > 0) rawText = paragraphs.join('\n\n');
    }

    return {
      bookId: sdBook ? sdBook[1] : (breadBook ? breadBook[1] : null),
      chapterSlug: sdChapter ? sdChapter[1] : null,
      title: titleMatch ? cleanText(titleMatch[1]) : '',
      novelTitle: breadBook ? cleanText(breadBook[2]) : '',
      locked,
      rawText
    };
  }

  function formatTitle(slug, rawTitle) {
    const cleaned = String(rawTitle || '')
      .replace(/最新章节[\s\S]*$/, '')
      .replace(/\s*-\s*独阅读\s*$/, '')
      .trim();
    if (cleaned) return cleaned;
    return slug ? `Book ${slug}` : '';
  }

  async function fetchBookHtml(slug, seriesUrl) {
    const resp = await fetch(seriesUrl || bookUrl(slug));
    if (!resp.ok) return null;
    return resp.text();
  }

  return {
    id: 'nkwwlkj',
    name: '独阅读 (nkwwlkj.cn)',
    domains: ['www.nkwwlkj.cn', 'nkwwlkj.cn'],
    supportsBulkDownload: false,

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
      return !!info && (info.type === 'home' || info.type === 'series');
    },

    parseUrl(urlStr) {
      if (!this.matches(urlStr)) return null;
      try {
        const { pathname } = new URL(urlStr);
        const book = pathname.match(/^\/book\/book_detail\/(\d+)/i);
        if (book) {
          return { type: 'series', slug: book[1], chapterNumber: null, url: urlStr, seriesUrl: bookUrl(book[1]) };
        }
        const chapter = pathname.match(/^\/chapter\/book_chapter_detail\/(\d+)/i);
        if (chapter) {
          return { type: 'chapter', slug: null, chapterSlug: chapter[1], chapterNumber: null, url: urlStr };
        }
        if (pathname === '/' || pathname === '' || /^\/index\/?$/i.test(pathname)) {
          return { type: 'home', slug: null, chapterNumber: null, url: urlStr };
        }
        return { type: 'other', slug: null, chapterNumber: null, url: urlStr };
      } catch (e) {
        return null;
      }
    },

    parseSeriesHtml,
    parseChapterListHtml,
    parseChapterPageHtml,

    extractSeriesMetadata(doc) {
      return parseSeriesHtml(docHtml(doc));
    },

    resolveChapterPage(doc) {
      const page = parseChapterPageHtml(docHtml(doc));
      if (!page.bookId || !page.chapterSlug) return null;
      return { slug: page.bookId, chapterSlug: page.chapterSlug };
    },

    extractChapterInfo(doc, chapterNumber) {
      const page = parseChapterPageHtml(docHtml(doc));
      if (page.locked || !page.rawText) return null;
      return {
        chapterNumber,
        title: page.title || `Chapter ${chapterNumber}`,
        novelTitle: page.novelTitle,
        rawText: page.rawText
      };
    },

    async fetchSeriesMetadata(slug, seriesUrl) {
      if (!slug) return null;
      try {
        const html = await fetchBookHtml(slug, seriesUrl);
        return html ? parseSeriesHtml(html) : null;
      } catch (e) {
        console.warn('[nkwwlkj Provider] Error fetching book metadata:', e);
        return null;
      }
    },

    async fetchChapterList(slug, seriesUrl) {
      if (!slug) return [];
      try {
        const html = await fetchBookHtml(slug, seriesUrl);
        return html ? parseChapterListHtml(html) : [];
      } catch (e) {
        console.warn('[nkwwlkj Provider] Error fetching chapter list:', e);
        return [];
      }
    },

    async fetchChapterContent() {
      throw new Error('独阅读 chapters cannot be downloaded in the background. Open the chapter page in the browser to save it.');
    },

    formatTitle
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NkwwlkjProvider;
}
if (typeof globalThis !== 'undefined') {
  globalThis.NkwwlkjProvider = NkwwlkjProvider;
}
