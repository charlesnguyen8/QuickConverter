// Hand-off page for downloads of page sites: the background tab opens here first and replaces
// itself with the chapter page, so the site sees a page-started navigation (like a
// clicked link) instead of a browser-started one.
(function () {
  function webPage(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  const target = webPage(new URLSearchParams(location.search).get('url'));
  if (target) {
    location.replace(target);
  } else {
    document.body.textContent = 'Nothing to open.';
  }
})();
