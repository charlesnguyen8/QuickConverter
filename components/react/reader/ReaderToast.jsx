import React, { useCallback, useEffect, useRef, useState } from 'react';

export default function ReaderToast() {
  const [msg, setMsg] = useState('Chapter changes saved');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const show = useCallback((text) => {
    if (text) setMsg(text);
    setVisible(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2500);
  }, []);

  useEffect(() => {
    const onShow = (e) => show(e.detail);
    window.addEventListener('reader-show-toast', onShow);
    return () => {
      window.removeEventListener('reader-show-toast', onShow);
      clearTimeout(timerRef.current);
    };
  }, [show]);

  return (
    <div
      id="save-toast"
      className={`fixed bottom-6 right-6 z-50 transform transition-all duration-300 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-xl bg-slate-900 border border-emerald-500/50 text-emerald-200 text-xs sm:text-sm font-medium ${visible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0 pointer-events-none'}`}
    >
      <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <polyline points="20 6 9 17 4 12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></polyline>
      </svg>
      <span id="save-toast-msg">{msg}</span>
    </div>
  );
}
