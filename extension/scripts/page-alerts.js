// QuickConverter alert catcher: runs in the page itself (world MAIN, document_start) on chapter
// pages. In a tab a download opened (marked #qc-download), site alerts would freeze the hidden
// tab, so they are recorded on <html data-qc-alerts> for the page script instead of shown. Tabs
// the user opened keep the site's alerts.
(function () {
  if (String(location.hash || '').indexOf('qc-download') === -1) return;
  const seen = [];
  window.alert = function (message) {
    seen.push(String(message));
    document.documentElement.setAttribute('data-qc-alerts', JSON.stringify(seen));
  };
})();
