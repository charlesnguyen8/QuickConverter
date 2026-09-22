import React, { useEffect, useMemo, useState } from 'react';
import SettingsStorageTab from './SettingsStorageTab.jsx';
import SettingsReaderTab from './SettingsReaderTab.jsx';
import SettingsDeepSeekTab from './SettingsDeepSeekTab.jsx';

const TABS = [
  { id: 'deepseek', icon: '🌐', label: 'DeepSeek AI' },
  { id: 'reader', icon: '📖', label: 'Reader Typography' },
  { id: 'storage', icon: '💾', label: 'Storage & Quota' },
  { id: 'about', icon: 'ℹ️', label: 'About' }
];

const NAV_ACTIVE = 'settings-nav-btn active flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-semibold transition border border-indigo-500/30 bg-indigo-600/15 text-indigo-300 shadow-sm whitespace-nowrap cursor-pointer';
const NAV_IDLE = 'settings-nav-btn flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-medium transition border border-slate-800 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 whitespace-nowrap cursor-pointer';

function resolveBack() {
  const fallback = { href: 'library.html', text: 'Back to Library', title: '' };
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');
  const id = params.get('id');
  const ch = params.get('ch');

  if (from === 'reader' && id && ch) {
    return {
      href: `reader.html?id=${encodeURIComponent(id)}&ch=${encodeURIComponent(ch)}`,
      text: `Back to Chapter ${ch}`,
      title: `Return to Chapter ${ch}`
    };
  }
  if (from === 'novel' && id) {
    return { href: `novel.html?id=${encodeURIComponent(id)}`, text: 'Back to Novel', title: 'Return to Novel Overview' };
  }
  if (from === 'library') {
    return { href: 'library.html', text: 'Back to Library', title: 'Return to Novel Library' };
  }
  return fallback;
}

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState('deepseek');
  const back = useMemo(resolveBack, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.wireSettingsDeepseek === 'function') {
      window.wireSettingsDeepseek();
    }
  }, []);

  console.log('[SettingsView] render', { activeTab });

  return (
    <>
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-4 sm:px-8 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <a
            id="settings-back-btn"
            href={back.href}
            title={back.title}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 transition px-3 py-1.5 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 flex-shrink-0 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span id="settings-back-text">{back.text}</span>
          </a>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
              Q
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent leading-tight">
                Settings & Preferences
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                DeepSeek AI, Reader Appearance, and Storage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span id="settings-save-pill" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 opacity-0 transition-opacity duration-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Saved</span>
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto w-full px-4 sm:px-8 py-8 flex-1 flex flex-col md:flex-row gap-8">
        <aside className="w-full md:w-64 flex-shrink-0 flex md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0 select-none">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-tab={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={activeTab === tab.id ? NAV_ACTIVE : NAV_IDLE}
            >
              <span className="text-base">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </aside>

        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <section id="tab-content-deepseek" className={`settings-tab-section flex flex-col gap-6${activeTab === 'deepseek' ? '' : ' hidden'}`}>
            <SettingsDeepSeekTab />
          </section>

          <section id="tab-content-reader" className={`settings-tab-section flex flex-col gap-6${activeTab === 'reader' ? '' : ' hidden'}`}>
            <SettingsReaderTab />
          </section>

          <section id="tab-content-storage" className={`settings-tab-section flex flex-col gap-6${activeTab === 'storage' ? '' : ' hidden'}`}>
            <SettingsStorageTab />
          </section>

          <section id="tab-content-about" className={`settings-tab-section flex flex-col gap-6${activeTab === 'about' ? '' : ' hidden'}`}>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <span>ℹ️</span>
                <span>About QuickConverter</span>
              </h2>
              <p className="text-xs text-slate-400">Information about the extension and active features.</p>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6 shadow-sm backdrop-blur flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-extrabold text-2xl shadow-md">
                  Q
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">QuickConverter</h3>
                  <p className="text-xs text-slate-400">Version 1.0.0 • Manifest V3 Extension</p>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                QuickConverter turns web novel reading and chapter preservation into a seamless, offline-capable experience. Built with native browser IndexedDB storage, real-time DeepSeek AI literary translation, context-caching cost calculation, and customizable reading typography.
              </p>

              <div className="border-t border-slate-700/60 pt-4 flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-900 border border-slate-700 text-slate-300">✨ DeepSeek Flash & Chat</span>
                <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-900 border border-slate-700 text-slate-300">⚡ IndexedDB Engine</span>
                <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-900 border border-slate-700 text-slate-300">🎨 Reactive Typography</span>
                <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-900 border border-slate-700 text-slate-300">💳 Live Balance Polling</span>
              </div>
            </div>
          </section>
        </div>
      </main>

      <div id="settings-toast" className="fixed bottom-6 right-6 z-50 transform translate-y-20 opacity-0 transition-all duration-200 pointer-events-none">
        <div className="bg-slate-800 text-slate-100 px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-3 text-sm font-medium">
          <span id="settings-toast-icon">✓</span>
          <span id="settings-toast-msg">Settings saved</span>
        </div>
      </div>
    </>
  );
}
