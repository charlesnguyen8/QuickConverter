import React, { useEffect, useRef, useState } from 'react';

export function watchLoginState({ provider, context, target, onState }) {
  if (!provider || typeof provider.fetchLoginState !== 'function') {
    return { stop() {}, recheck() {} };
  }
  let stopped = false;
  let pending = false;

  const recheck = () => {
    if (stopped || pending) return;
    pending = true;
    let request;
    try {
      request = Promise.resolve(provider.fetchLoginState(context));
    } catch (e) {
      request = Promise.resolve(null);
    }
    request
      .catch(() => null)
      .then((state) => {
        pending = false;
        if (!stopped) onState(state || null);
      });
  };

  const onFocus = () => recheck();
  const onVisibility = () => {
    const doc = target && target.document;
    if (!doc || doc.visibilityState !== 'hidden') recheck();
  };

  if (target && typeof target.addEventListener === 'function') {
    target.addEventListener('focus', onFocus);
    target.addEventListener('visibilitychange', onVisibility);
  }
  recheck();

  return {
    recheck,
    stop() {
      stopped = true;
      if (target && typeof target.removeEventListener === 'function') {
        target.removeEventListener('focus', onFocus);
        target.removeEventListener('visibilitychange', onVisibility);
      }
    }
  };
}

export function handleLoginLink(event, url, { siteSave = typeof window !== 'undefined' ? window.SiteSave : null, onDone } = {}) {
  if (!url || !siteSave || typeof siteSave.available !== 'function' || !siteSave.available()) return;
  event.preventDefault();
  siteSave.openLogin(url).catch(() => null).then(() => {
    if (typeof onDone === 'function') onDone();
  });
}

function formatCount(value) {
  return Number(value).toLocaleString('en-US');
}

function providerForNovel(novel) {
  const registry = typeof window !== 'undefined' ? window.ProviderRegistry : null;
  if (!novel || !registry || typeof registry.getProviderForNovel !== 'function') return null;
  const provider = registry.getProviderForNovel(novel);
  return provider && typeof provider.fetchLoginState === 'function' ? provider : null;
}

export function ProviderLoginStatus({ state, providerName, loginUrl, compact = false, onRecheck }) {
  if (!state) return null;

  if (state.loggedIn) {
    const balance = state.balance && typeof state.balance.coins === 'number' ? state.balance : null;
    return (
      <div
        id="provider-login-status"
        className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 self-start px-2.5 py-1 rounded-md text-xs font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/30"
        role="status"
      >
        <span>
          <span aria-hidden="true">✓ </span>
          Logged in to {providerName}
          {state.userName ? ` as ${state.userName}` : ''}
        </span>
        {balance ? (
          <span id="provider-coin-balance" className="text-amber-200">
            {formatCount(balance.coins)} coins
            {typeof balance.bonusCoins === 'number' ? ` · ${formatCount(balance.bonusCoins)} bonus` : ''}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      id="provider-login-status"
      className={`flex flex-wrap items-center gap-2 ${compact ? 'p-2 text-[11px]' : 'p-3 text-xs'} rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200`}
      role="status"
    >
      <span className="flex-1 min-w-0">
        You are not logged in to {providerName}. Log in on the official site to open the paid chapters you have unlocked.
      </span>
      <a
        id="provider-login-btn"
        href={loginUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => handleLoginLink(e, loginUrl, { onDone: onRecheck })}
        className="inline-flex items-center justify-center gap-1 min-h-10 px-4 rounded-lg text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition"
      >
        <span>Log in</span>
        <span aria-hidden="true">↗</span>
      </a>
      {onRecheck ? (
        <button
          id="provider-login-recheck-btn"
          type="button"
          onClick={onRecheck}
          className="inline-flex items-center justify-center min-h-10 px-3 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition"
        >
          Check again
        </button>
      ) : null}
    </div>
  );
}

export function useProviderLogin(novel) {
  const provider = providerForNovel(novel);
  const [state, setState] = useState(null);
  const watcherRef = useRef(null);

  const novelRef = useRef(novel);
  novelRef.current = novel;
  const novelKey = novel ? novel.id || novel.url || '' : '';

  useEffect(() => {
    if (!provider) {
      setState(null);
      return undefined;
    }
    const watcher = watchLoginState({ provider, context: novelRef.current, target: window, onState: setState });
    watcherRef.current = watcher;
    return () => {
      watcher.stop();
      watcherRef.current = null;
    };
  }, [provider, novelKey]);

  return {
    provider,
    state,
    recheck: () => {
      if (watcherRef.current) watcherRef.current.recheck();
    }
  };
}

export default function ProviderLoginBanner({ novel, compact = false }) {
  const { provider, state, recheck } = useProviderLogin(novel);
  if (!provider) return null;
  return (
    <ProviderLoginStatus
      state={state}
      providerName={provider.shortName || provider.name}
      loginUrl={provider.loginUrl(novel && novel.url)}
      compact={compact}
      onRecheck={recheck}
    />
  );
}
