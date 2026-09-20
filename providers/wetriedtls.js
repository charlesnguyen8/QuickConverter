// QuickConverter - WeTriedTLS Site Provider Adapter
// Encapsulates all domain-specific logic, DOM parsing, and metadata fetching for wetriedtls.com

const WetriedtlsProvider = {
  id: 'wetriedtls',
  name: 'We Tried TLS',
  domains: ['wetriedtls.com', 'www.wetriedtls.com'],

  matches(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return this.domains.includes(parsed.hostname);
    } catch (e) {
      return false;
    }
  },

  shouldAutoOpenPopup(urlStr) {
    if (!this.matches(urlStr)) return false;
    try {
      const url = new URL(urlStr);
      const isHomepage = url.pathname === '/' || url.pathname === '';
      const isSeriesLanding = url.pathname.startsWith('/series/') && !url.pathname.includes('/chapter');
      return isHomepage || isSeriesLanding;
    } catch (e) {
      return false;
    }
  },

  parseUrl(urlStr) {
    if (!this.matches(urlStr)) return null;
    try {
      const url = new URL(urlStr);
      const pathname = url.pathname;

      // 1. Chapter Page: /series/{slug}/chapter-{ch}
      const chapterMatch = pathname.match(/^\/series\/([^/]+)\/chapter-([0-9.]+)/i);
      if (chapterMatch) {
        return {
          type: 'chapter',
          slug: chapterMatch[1],
          chapterNumber: parseFloat(chapterMatch[2]),
          url: urlStr,
          seriesUrl: `https://wetriedtls.com/series/${chapterMatch[1]}`
        };
      }

      // 2. Series Overview Page: /series/{slug}
      const seriesMatch = pathname.match(/^\/series\/([^/]+)\/?$/i);
      if (seriesMatch) {
        return {
          type: 'series',
          slug: seriesMatch[1],
          chapterNumber: null,
          url: urlStr,
          seriesUrl: `https://wetriedtls.com/series/${seriesMatch[1]}`
        };
      }

      // 3. Homepage
      if (pathname === '/' || pathname === '') {
        return {
          type: 'home',
          slug: null,
          chapterNumber: null,
          url: urlStr
        };
      }

      return {
        type: 'other',
        slug: null,
        chapterNumber: null,
        url: urlStr
      };
    } catch (e) {
      return null;
    }
  },

  extractSeriesMetadata(doc) {
    let totalChapters = null;

    // 1. Search DOM elements for 'Total chapters' label in sidebar card
    const elements = Array.from(doc.querySelectorAll('span, div, dt'));
    const totalChapterLabel = elements.find(
      (el) => el.textContent && el.textContent.trim().toLowerCase() === 'total chapters'
    );

    if (totalChapterLabel) {
      const sibling = totalChapterLabel.nextElementSibling;
      if (sibling && sibling.textContent) {
        const num = parseInt(sibling.textContent.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num) && num > 0) {
          totalChapters = num;
        }
      }
    }

    // 2. Fallback regex on document HTML
    if (!totalChapters && doc.documentElement) {
      const html = doc.documentElement.innerHTML;
      const match = html.match(/Total chapters<\/span>\s*<span[^>]*>\s*(\d+)\s*<\/span>/i)
                 || html.match(/Total chapters[\s\S]*?>\s*(\d+)\s*<\//i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > 0) {
          totalChapters = num;
        }
      }
    }

    // Extract artwork thumbnail
    let thumbnail = null;
    const ogImg = doc.querySelector('meta[property="og:image"]');
    if (ogImg && ogImg.content) {
      thumbnail = ogImg.content;
    }
    if (!thumbnail) {
      const imgEl = doc.querySelector('img[src*="reaperscans.net"], img[src*="/_next/image"]');
      if (imgEl && imgEl.src) {
        thumbnail = imgEl.src;
      }
    }

    // Extract title
    let title = '';
    const h1 = doc.querySelector('h1');
    if (h1 && h1.textContent) {
      title = h1.textContent.trim();
    } else {
      const ogTitle = doc.querySelector('meta[property="og:title"]');
      if (ogTitle && ogTitle.content) {
        title = ogTitle.content.replace(/\s*-\s*We Tried TLS.*$/i, '').trim();
      }
    }

    return {
      title,
      totalChapters,
      thumbnail,
      author: null,
      status: 'Active'
    };
  },

  extractChapterInfo(doc, chapterNumber) {
    // 1. In wetriedtls.com, chapter paragraphs have dir="auto"
    const pElements = Array.from(doc.querySelectorAll('p[dir="auto"]'));
    let rawText = null;

    if (pElements.length > 0) {
      const text = pElements
        .map((p) => p.innerText ? p.innerText.trim() : (p.textContent ? p.textContent.trim() : ''))
        .filter((t) => t.length > 0 && t !== '&nbsp;')
        .join('\n\n');

      if (text.length > 20) {
        rawText = text;
      }
    }

    // Fallback: search inside main reader container
    if (!rawText) {
      const main = doc.querySelector('main');
      if (main) {
        const paragraphs = Array.from(main.querySelectorAll('p'));
        if (paragraphs.length > 3) {
          rawText = paragraphs
            .map((p) => p.innerText ? p.innerText.trim() : (p.textContent ? p.textContent.trim() : ''))
            .filter(Boolean)
            .join('\n\n');
        }
      }
    }

    if (!rawText) return null;

    // Extract Chapter Title
    let chapterTitle = `Chapter ${chapterNumber}`;
    const h1 = doc.querySelector('h1');
    if (h1 && h1.innerText) {
      chapterTitle = h1.innerText.trim();
    } else if (doc.title) {
      const parts = doc.title.split('-');
      if (parts.length >= 2) {
        chapterTitle = parts[1].trim();
      }
    }

    // Extract Novel Title
    let novelTitle = '';
    const h2 = doc.querySelector('h2');
    if (h2 && h2.innerText) {
      novelTitle = h2.innerText.trim();
    } else if (doc.title) {
      const parts = doc.title.split('-');
      if (parts.length > 0 && !parts[0].toLowerCase().includes('just a moment')) {
        novelTitle = parts[0].trim();
      }
    }

    return {
      chapterNumber,
      title: chapterTitle,
      novelTitle,
      rawText
    };
  },

  async fetchSeriesMetadata(slug, seriesUrl) {
    if (!slug) return null;
    const url = seriesUrl || `https://wetriedtls.com/series/${slug}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;

      const html = await resp.text();
      const match = html.match(/Total chapters<\/span>\s*<span[^>]*>\s*(\d+)\s*<\/span>/i)
                 || html.match(/Total chapters[\s\S]*?>\s*(\d+)\s*<\//i);
      const totalChapters = match ? parseInt(match[1], 10) : null;

      const ogImgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
      const thumbnail = ogImgMatch ? ogImgMatch[1] : null;

      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
                      || html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
      let title = titleMatch ? titleMatch[1].replace(/\s*-\s*We Tried TLS.*$/i, '').trim() : this.formatTitle(slug);

      return {
        title,
        totalChapters,
        thumbnail,
        author: null,
        status: 'Active'
      };
    } catch (e) {
      console.warn('[WeTriedTLS Provider] Error fetching series metadata:', e);
      return null;
    }
  },

  formatTitle(slug, rawTitle) {
    if (rawTitle && rawTitle.trim() && !rawTitle.toLowerCase().includes('wetriedtls')) {
      return rawTitle.trim();
    }
    if (!slug) return '';
    return slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/\bRegressors\b/i, "Regressor’s")
      .replace(/\bAcademys\b/i, "Academy’s");
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WetriedtlsProvider;
}
if (typeof globalThis !== 'undefined') {
  globalThis.WetriedtlsProvider = WetriedtlsProvider;
}
