/**
 * QuickConverter - Settings Page Controller
 * Manages global defaults for DeepSeek AI, Reader Typography with Live Preview, and Storage Quotas.
 */


document.addEventListener('DOMContentLoaded', async () => {
  // --- Navigation & Context-aware Return Setup ---
  initNavigation();

  // --- Sidebar Tab Switching ---
  initTabs();

});

// =========================================================================
// 1. Navigation & Context-aware Return
// =========================================================================
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
    // Default fallback
    backBtn.href = 'library.html';
    if (backText) backText.textContent = 'Back to Library';
  }
}

// =========================================================================
// 2. Sidebar Tab Switching
// =========================================================================
function initTabs() {
  const tabButtons = document.querySelectorAll('.settings-nav-btn');
  const sections = document.querySelectorAll('.settings-tab-section');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      // Update button visual styles
      tabButtons.forEach((b) => {
        b.classList.remove(
          'active',
          'border-indigo-500/30',
          'bg-indigo-600/15',
          'text-indigo-300',
          'font-semibold'
        );
        b.classList.add(
          'border-slate-800',
          'bg-slate-850',
          'text-slate-400',
          'font-medium'
        );
      });

      btn.classList.add(
        'active',
        'border-indigo-500/30',
        'bg-indigo-600/15',
        'text-indigo-300',
        'font-semibold'
      );
      btn.classList.remove(
        'border-slate-800',
        'bg-slate-850',
        'text-slate-400',
        'font-medium'
      );

      // Toggle corresponding section
      sections.forEach((sec) => {
        if (sec.id === `tab-content-${targetTab}`) {
          sec.classList.remove('hidden');
        } else {
          sec.classList.add('hidden');
        }
      });
    });
  });
}

// =========================================================================
// 3. DeepSeek AI Settings Controller
// =========================================================================
let balanceTracker = null;


function updateBalanceDisplay(data) {
  const balanceText = document.getElementById('settings-balance-text');
  const grantedText = document.getElementById('settings-granted-text');
  const headerBadge = document.getElementById('deepseek-header-balance');
  const headerVal = document.getElementById('deepseek-header-balance-val');

  if (!data || !data.success || !data.isAvailable) {
    if (balanceText) {
      if (data && data.success && !data.isAvailable) {
        balanceText.textContent = `${data.compact || '$0.00'} (No Funds)`;
      } else {
        balanceText.textContent = 'No Balance Available';
      }
    }
    if (grantedText) {
      grantedText.textContent = data && data.error ? `(${data.error})` : '(Key not set or invalid)';
    }
    if (headerVal) headerVal.textContent = 'Unconfigured';
    return;
  }

  const total = parseFloat(data.totalBalance || '0').toFixed(2);
  const granted = parseFloat(data.grantedBalance || '0').toFixed(2);
  const currency = data.currency || 'USD';
  const symbol = data.currencySymbol || '$';

  if (balanceText) {
    balanceText.textContent = `${symbol}${total} ${currency}`;
  }
  if (grantedText) {
    grantedText.textContent = `(Includes ${symbol}${granted} granted)`;
  }
  if (headerVal) {
    headerVal.textContent = `${symbol}${total}`;
  }
  if (headerBadge) {
    headerBadge.classList.remove('hidden');
    headerBadge.classList.add('inline-flex');
  }
}

// =========================================================================
// 6. UI Notification & Toast Helpers
// =========================================================================
let toastTimeout = null;

function triggerSaveIndicator(message = 'Settings saved') {
  const pill = document.getElementById('settings-save-pill');
  if (pill) {
    pill.classList.remove('opacity-0');
    setTimeout(() => {
      pill.classList.add('opacity-0');
    }, 1800);
  }

  const toast = document.getElementById('settings-toast');
  const toastMsg = document.getElementById('settings-toast-msg');
  if (toast && toastMsg) {
    toastMsg.textContent = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.add('translate-y-20', 'opacity-0');
      toast.classList.remove('translate-y-0', 'opacity-100');
    }, 2200);
  }
}
