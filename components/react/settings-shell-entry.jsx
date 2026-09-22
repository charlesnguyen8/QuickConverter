// Settings page shell wiring (navigation + sidebar tabs). Replaces views/settings.js:
// the markup stays in settings.html, this module attaches the behaviour once the
// deferred module executes (after the document is parsed).
function initNavigation() {
  const backBtn = document.getElementById('settings-back-btn');
  const backText = document.getElementById('settings-back-text');
  if (!backBtn) return;

  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');
  const id = params.get('id');
  const ch = params.get('ch');

  if (from === 'reader' && id && ch) {
    backBtn.href = `reader.html?id=${encodeURIComponent(id)}&ch=${encodeURIComponent(ch)}`;
    if (backText) backText.textContent = `Back to Chapter ${ch}`;
    backBtn.title = `Return to Chapter ${ch}`;
  } else if (from === 'novel' && id) {
    backBtn.href = `novel.html?id=${encodeURIComponent(id)}`;
    if (backText) backText.textContent = 'Back to Novel';
    backBtn.title = 'Return to Novel Overview';
  } else if (from === 'library') {
    backBtn.href = 'library.html';
    if (backText) backText.textContent = 'Back to Library';
    backBtn.title = 'Return to Novel Library';
  } else {
    backBtn.href = 'library.html';
    if (backText) backText.textContent = 'Back to Library';
  }
}

function initTabs() {
  const tabButtons = document.querySelectorAll('.settings-nav-btn');
  const sections = document.querySelectorAll('.settings-tab-section');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabButtons.forEach((b) => {
        b.classList.remove('active', 'border-indigo-500/30', 'bg-indigo-600/15', 'text-indigo-300', 'font-semibold');
        b.classList.add('border-slate-800', 'bg-slate-850', 'text-slate-400', 'font-medium');
      });

      btn.classList.add('active', 'border-indigo-500/30', 'bg-indigo-600/15', 'text-indigo-300', 'font-semibold');
      btn.classList.remove('border-slate-800', 'bg-slate-850', 'text-slate-400', 'font-medium');

      sections.forEach((sec) => {
        if (sec.id === `tab-content-${targetTab}`) sec.classList.remove('hidden');
        else sec.classList.add('hidden');
      });
    });
  });
}

if (typeof document !== 'undefined') {
  initNavigation();
  initTabs();
}
