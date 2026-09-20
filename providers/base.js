// QuickConverter - Site Provider Base Contract & Interface Documentation
// Every novel site adapter must implement this interface.

/**
 * @typedef {Object} ProviderUrlInfo
 * @property {'series' | 'chapter' | 'home' | 'other'} type
 * @property {string|null} slug
 * @property {number|null} chapterNumber
 * @property {string} url
 */

/**
 * @typedef {Object} SeriesMetadata
 * @property {string} title
 * @property {number|null} totalChapters
 * @property {string|null} thumbnail
 * @property {string|null} author
 * @property {string|null} status
 */

/**
 * @typedef {Object} ChapterInfo
 * @property {number} chapterNumber
 * @property {string} title
 * @property {string} novelTitle
 * @property {string|null} rawText
 */

const BaseProvider = {
  id: '',
  name: '',
  domains: [],

  /**
   * Checks whether this provider handles the given URL.
   * @param {string} url
   * @returns {boolean}
   */
  matches(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return this.domains.includes(parsed.hostname);
    } catch (e) {
      return false;
    }
  },

  /**
   * Determines if the extension popup should automatically open on this URL.
   * @param {string} url
   * @returns {boolean}
   */
  shouldAutoOpenPopup(url) {
    return false;
  },

  /**
   * Parses the URL into normalized novel information.
   * @param {string} url
   * @returns {ProviderUrlInfo|null}
   */
  parseUrl(url) {
    return null;
  },

  /**
   * Extracts series metadata from a live DOM / HTML document.
   * @param {Document} doc
   * @returns {SeriesMetadata}
   */
  extractSeriesMetadata(doc) {
    return {
      title: '',
      totalChapters: null,
      thumbnail: null,
      author: null,
      status: 'Active'
    };
  },

  /**
   * Extracts chapter text and details from a live chapter reading DOM.
   * @param {Document} doc
   * @param {number} chapterNumber
   * @returns {ChapterInfo|null}
   */
  extractChapterInfo(doc, chapterNumber) {
    return null;
  },

  /**
   * Fetches and parses series metadata in the background via HTTP.
   * @param {string} slug
   * @param {string} [seriesUrl]
   * @returns {Promise<SeriesMetadata|null>}
   */
  async fetchSeriesMetadata(slug, seriesUrl) {
    return null;
  },

  /**
   * Fetches the complete chapter catalog for a series.
   * @param {string} slug
   * @param {string} [seriesUrl]
   * @returns {Promise<Array<{ chapterNumber: number, title: string, slug: string, url: string }>>}
   */
  async fetchChapterList(slug, seriesUrl) {
    return [];
  },

  /**
   * Fetches chapter text content by chapter slug or number.
   * @param {string} slug
   * @param {string|number} chapterSlugOrNumber
   * @returns {Promise<{ title: string, rawText: string }|null>}
   */
  async fetchChapterContent(slug, chapterSlugOrNumber) {
    return null;
  },

  /**
   * Formats a slug into a clean title.
   * @param {string} slug
   * @param {string} [rawTitle]
   * @returns {string}
   */
  formatTitle(slug, rawTitle) {
    if (rawTitle && rawTitle.trim()) return rawTitle.trim();
    if (!slug) return '';
    return slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BaseProvider;
}
if (typeof globalThis !== 'undefined') {
  globalThis.BaseProvider = BaseProvider;
}
