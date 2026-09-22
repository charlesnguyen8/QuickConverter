(function (global) {
  function escapeHtml(str) {
    if (str === null || str === undefined || str === '') return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  const UIUtils = { escapeHtml, escapeAttr };

  if (typeof window !== 'undefined') {
    window.UIUtils = UIUtils;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIUtils;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
