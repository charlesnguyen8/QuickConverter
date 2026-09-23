import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { buildDownloadOptions } from './aiConfigOptions.js';

const DEFAULT_PROMPT = 'Translate the novel chapter text to high-quality, fluent English. Maintain consistent character names, martial arts/cultivation terms, and literary tone.';
const DEFAULT_CUSTOM_URL = 'http://127.0.0.1:8000/v1';

const TEXTS = {
  full: {
    badgeOfficial: 'Official API',
    badgeBridge: 'Local Bridge (Free)',
    badgeCustom: 'Custom API',
    apiKeyLabelOfficial: '1. DeepSeek API Key',
    apiKeyLabelCustom: '1. API Key (Optional for local)',
    apiKeyPlaceholderOfficial: 'sk-...',
    apiKeyPlaceholderCustom: 'Optional (leave blank for local bridge)',
    pricingFree: 'Free / Custom',
    pricingFreeTitle: 'Custom API / Local Bridge endpoint',
    toggleOn: 'Active (Translates on Download)',
    toggleOff: 'Off (Save Raw Chapter)',
    visibilityShow: 'Show Key',
    visibilityHide: 'Hide Key',
    testCustomButtonLabel: 'Test Connection',
    testConnecting: 'Testing connection...',
    modelsWord: 'models ready',
    description: 'When enabled, chapters are automatically translated via DeepSeek API before saving to library.'
  },
  compact: {
    badgeOfficial: 'Official Cloud',
    badgeBridge: 'Custom API / Free',
    badgeCustom: 'Custom API / Free',
    apiKeyLabelOfficial: '1. DeepSeek API Key',
    apiKeyLabelCustom: '1. API Key (Optional for local)',
    apiKeyPlaceholderOfficial: 'sk-...',
    apiKeyPlaceholderCustom: 'Optional (e.g. sk-... or leave blank for local)',
    pricingFree: 'Free • Custom API',
    pricingFreeTitle: 'Custom API / Local Bridge: No token fees charged to QuickConverter',
    toggleOn: 'Active (Translates on Download)',
    toggleOff: 'Off (Save Raw)',
    visibilityShow: 'Show',
    visibilityHide: 'Hide',
    testCustomButtonLabel: 'Ping',
    testConnecting: 'Testing connection...',
    modelsWord: 'models'
  }
};

const OPTION_DEFAULTS = {
  full: {
    testKeyProviderAware: true,
    customApiRowFlex: false,
    cooldownBadgeMode: 'active',
    modelLabelReasoner: true,
    readerPromptStyle: false
  },
  compact: {
    testKeyProviderAware: false,
    customApiRowFlex: true,
    cooldownBadgeMode: 'compact',
    modelLabelReasoner: false,
    readerPromptStyle: false
  }
};

const DEFAULT_CAPABILITIES = {
  provider: true,
  balance: true,
  prompt: true,
  cooldown: true,
  modelSelect: true,
  testConnection: true
};

const DEFAULT_MODELS = {
  full: ['deepseek-flash', 'deepseek-chat', 'deepseek-reasoner'],
  compact: ['deepseek-flash', 'deepseek-chat']
};

const DEFAULT_PRICING = {
  label: 'Off-Peak (50% Off)',
  badgeClass: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
  title: 'Live DeepSeek UTC Pricing Schedule'
};

function service() {
  return typeof window !== 'undefined' ? window.DeepSeekService : null;
}

function getStored(key, fallback) {
  if (typeof window !== 'undefined' && window.StorageService && typeof window.StorageService.getPreference === 'function') {
    try { return window.StorageService.getPreference(key, fallback); } catch (e) {}
  }
  if (typeof localStorage !== 'undefined') {
    const value = localStorage.getItem(key);
    return value === null || value === undefined ? fallback : value;
  }
  return fallback;
}

function setStored(key, val) {
  if (typeof window !== 'undefined' && window.StorageService && typeof window.StorageService.setPreference === 'function') {
    try { window.StorageService.setPreference(key, val); return; } catch (e) {}
  }
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(val));
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) chrome.storage.local.set({ [key]: String(val) });
  } catch (e) {}
}

function formatSecondsHuman(sec) {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m} min` : `${m}m ${rem}s`;
}

function modelLabel(id, modelLabelReasoner) {
  let label = id;
  if (id === 'deepseek-flash') label += ' (V4.1-Flash • Fast)';
  else if (id === 'deepseek-chat') label += ' (V3 • Standard)';
  else if (id === 'deepseek-reasoner' && modelLabelReasoner) label += ' (R1 • DeepThink)';
  return label;
}

function readCooldown() {
  let cfg = { enabled: true, minSec: 180, maxSec: 300 };
  try {
    const raw = getStored('quickconverter_queue_cooldown', null);
    if (raw) cfg = { ...cfg, ...JSON.parse(raw) };
  } catch (e) {}
  return cfg;
}

const AiConfigPanel = forwardRef(function AiConfigPanel(props, ref) {
  const {
    variant = 'full',
    capabilities: capabilityOverrides = {},
    options: optionOverrides = {},
    copy = {},
    ids = {},
    hooks = {},
    prompt = null,
    className = ''
  } = props;

  const compact = variant === 'compact';
  const caps = { ...DEFAULT_CAPABILITIES, ...capabilityOverrides };
  const options = { ...OPTION_DEFAULTS[variant], ...optionOverrides };
  const texts = { ...TEXTS[variant], ...copy };

  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState('official');
  const [customUrl, setCustomUrl] = useState(DEFAULT_CUSTOM_URL);
  const [apiKey, setApiKey] = useState('');
  const [rememberKey, setRememberKey] = useState(false);
  const [model, setModel] = useState('deepseek-flash');
  const [models, setModels] = useState(DEFAULT_MODELS[variant]);
  const [promptText, setPromptText] = useState(copy.prompt || DEFAULT_PROMPT);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptSavedFlash, setPromptSavedFlash] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState(false);
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [cooldown, setCooldown] = useState({ enabled: true, minSec: 180, maxSec: 300 });
  const [balance, setBalance] = useState(null);
  const [balanceUpdating, setBalanceUpdating] = useState(false);
  const [testStatus, setTestStatus] = useState(null);
  const [customTestStatus, setCustomTestStatus] = useState(null);

  const apiKeyRef = useRef('');
  const trackerRef = useRef(null);
  const keyDebounceRef = useRef(null);
  const editingRef = useRef(false);
  const keyInputRef = useRef(null);
  const hooksRef = useRef(hooks);

  apiKeyRef.current = apiKey;
  editingRef.current = editingPrompt;
  hooksRef.current = hooks;

  const isOfficial = provider === 'official';
  const isBridge = customUrl.includes('127.0.0.1') || customUrl.includes('localhost');

  const syncPricing = useCallback(() => {
    const ds = service();
    if (ds && typeof ds.getPricingStatus === 'function') {
      try {
        const status = ds.getPricingStatus();
        setPricing({ label: status.label, badgeClass: status.badgeClass, title: `${status.windowDesc} • Auto-applied UTC Schedule` });
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ds = service();

      let providerConfig = { provider: 'official', customUrl: DEFAULT_CUSTOM_URL };
      if (ds && typeof ds.getProviderConfig === 'function') {
        try { providerConfig = await ds.getProviderConfig(); } catch (e) {}
      }
      if (cancelled) return;

      setProvider(providerConfig.provider === 'official' ? 'official' : 'custom');
      setCustomUrl(providerConfig.customUrl || DEFAULT_CUSTOM_URL);
      setEnabled(getStored('quickconverter_deepseek_enabled', 'false') === 'true');
      setModel(getStored('quickconverter_deepseek_model', 'deepseek-flash'));
      setCooldown(readCooldown());

      if (caps.prompt) {
        let text = prompt;
        if (text == null && typeof hooks.getPrompt === 'function') {
          try { text = hooks.getPrompt(); } catch (e) {}
        }
        setPromptText(text || copy.prompt || DEFAULT_PROMPT);
      }

      if (providerConfig.provider === 'official') syncPricing();

      if (caps.balance && ds && typeof ds.getApiKey === 'function') {
        try {
          const stored = await ds.getApiKey();
          if (!cancelled) {
            setApiKey((stored && stored.apiKey) || '');
            setRememberKey(!!(stored && stored.remembered));
          }
        } catch (e) {}
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!caps.prompt || prompt == null) return;
    if (editingRef.current) return;
    setPromptText(prompt || copy.prompt || DEFAULT_PROMPT);
  }, [prompt, caps.prompt, copy.prompt]);

  useEffect(() => {
    if (!caps.balance) return undefined;
    const ds = service();
    if (!ds || typeof ds.createBalanceTracker !== 'function') return undefined;
    trackerRef.current = ds.createBalanceTracker(
      () => apiKeyRef.current.trim(),
      (info, updating) => {
        setBalance(info || null);
        setBalanceUpdating(!!updating);
      }
    );
    return () => { trackerRef.current = null; };
  }, [caps.balance]);

  useEffect(() => {
    if (!caps.balance) return undefined;
    const ds = service();
    if (!ds || typeof ds.getApiKey !== 'function') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const stored = await ds.getApiKey();
        if (cancelled) return;
        const key = (stored && stored.apiKey) || '';
        if (key && trackerRef.current) trackerRef.current.refresh(false);
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, [caps.balance]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (e) => {
      if (e.key !== 'quickconverter_deepseek_enabled' || e.newValue === null) return;
      const next = e.newValue === 'true';
      setEnabled((current) => {
        if (current !== next && typeof hooksRef.current.onToggle === 'function') hooksRef.current.onToggle(next);
        return next;
      });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persistCooldown = useCallback((next) => {
    setCooldown(next);
    setStored('quickconverter_queue_cooldown', JSON.stringify(next));
    const q = typeof window !== 'undefined' ? window.DownloadQueueService : null;
    if (q && typeof q.setCooldownConfig === 'function') q.setCooldownConfig(next);
  }, []);

  const handleToggleEnabled = (checked) => {
    setEnabled(checked);
    setStored('quickconverter_deepseek_enabled', checked ? 'true' : 'false');
    if (typeof hooks.onToggle === 'function') hooks.onToggle(checked);
  };

  const selectProvider = async (nextProvider, nextUrl) => {
    const ds = service();
    if (ds && typeof ds.setProviderConfig === 'function') {
      try {
        await ds.setProviderConfig(nextProvider === 'custom'
          ? { provider: 'custom', customUrl: nextUrl || customUrl }
          : { provider: 'official' });
      } catch (e) {}
    }
    setProvider(nextProvider);
    if (nextProvider === 'official') {
      syncPricing();
      if (trackerRef.current) trackerRef.current.refresh(true);
    } else {
      setBalance(null);
      setBalanceUpdating(false);
    }
    if (typeof hooks.onProviderChange === 'function') {
      hooks.onProviderChange(nextProvider, nextUrl || customUrl);
    }
  };

  const updateCustomUrl = async (value) => {
    setCustomUrl(value);
    const ds = service();
    if (ds && typeof ds.setProviderConfig === 'function') {
      try { await ds.setProviderConfig({ customUrl: value }); } catch (e) {}
    }
  };

  const handleApiKeyInput = (value) => {
    setApiKey(value);
    const ds = service();
    if (ds && typeof ds.setApiKey === 'function') ds.setApiKey(value.trim(), rememberKey);
    if (!value.trim()) {
      setBalance(null);
      setBalanceUpdating(false);
      return;
    }
    if (keyDebounceRef.current) clearTimeout(keyDebounceRef.current);
    keyDebounceRef.current = setTimeout(() => {
      if (trackerRef.current) trackerRef.current.refresh(true);
    }, 600);
  };

  const handleRememberChange = (checked) => {
    setRememberKey(checked);
    const ds = service();
    if (ds && typeof ds.setApiKey === 'function') ds.setApiKey(apiKey.trim(), checked);
  };

  const handleClearKey = async () => {
    const ds = service();
    if (ds && typeof ds.clearApiKey === 'function') {
      try { await ds.clearApiKey(); } catch (e) {}
    }
    setApiKey('');
    setRememberKey(false);
    setBalance(null);
    setBalanceUpdating(false);
    setTestStatus(null);
  };

  const handleModelChange = (value) => {
    setModel(value);
    setStored('quickconverter_deepseek_model', value);
  };

  const applyModelList = (list, preferred) => {
    if (!Array.isArray(list) || list.length === 0) return;
    setModels(list);
    if (preferred && list.includes(preferred)) setModel(preferred);
  };

  const runTest = async (target) => {
    const ds = service();
    const isCustom = provider !== 'official';
    const key = apiKey.trim();
    const aware = options.testKeyProviderAware;

    if (!key && (aware ? !isCustom : true)) {
      setTestStatus({ kind: 'warn', message: 'Please enter an API key to test.' });
      if (keyInputRef.current) keyInputRef.current.focus();
      return;
    }

    const hasSeparateCustomStatus = !!ids.testCustomStatus && ids.testCustomStatus !== ids.testStatus;
    const setStatus = (target === 'custom' && hasSeparateCustomStatus) ? setCustomTestStatus : setTestStatus;
    const buttonId = target === 'custom' ? ids.testCustomBtn : ids.testBtn;
    const button = buttonId ? document.getElementById(buttonId) : null;
    if (button) {
      button.disabled = true;
      if (target === 'custom') button.textContent = 'Testing...';
    }

    setStatus({ kind: 'loading', message: target === 'custom'
      ? `Pinging ${customUrl}/models...`
      : (aware ? `Connecting to ${isCustom ? 'Custom API / Bridge' : 'DeepSeek API'}...` : texts.testConnecting) });

    try {
      if (!ds || typeof ds.testConnection !== 'function') throw new Error('DeepSeekService not loaded');

      let res;
      if (target === 'custom') {
        res = await ds.testConnection(key, { provider: 'custom', baseUrl: customUrl });
        if (res && res.success) {
          applyModelList(res.models, model);
          setStatus({ kind: 'success', message: `✓ Custom API connected! (${(res.models || []).length} models ready)` });
        } else {
          setStatus({ kind: 'error', message: `✗ ${(res && res.error) || 'Connection failed'}` });
        }
      } else if (aware) {
        const baseUrl = isCustom ? (customUrl || DEFAULT_CUSTOM_URL) : undefined;
        res = await ds.testConnection(key, { provider, baseUrl });
        finishKeyTest(res, isCustom);
      } else {
        res = await ds.testConnection(key);
        finishKeyTest(res, false);
      }
    } catch (err) {
      setStatus({ kind: 'error', message: `✗ ${err.message || 'Error testing connection'}` });
    } finally {
      if (button) { button.disabled = false; if (target === 'custom') button.textContent = texts.testCustomButtonLabel; }
    }
  };

  const finishKeyTest = (res, isCustom) => {
    if (res && res.success) {
      applyModelList(res.models, model);
      const balStr = (options.testKeyProviderAware && isCustom)
        ? ' • Free / Custom'
        : (res.balance ? ` • Balance: ${res.balance.totalBalance === 'Available' ? 'Available' : '$' + res.balance.totalBalance}` : '');
      setTestStatus({ kind: 'success', message: `✓ Connected (${(res.models || []).length} ${texts.modelsWord}${balStr})` });
    } else {
      setTestStatus({ kind: 'error', message: `✗ ${(res && res.error) || 'Connection failed'}` });
    }
  };

  const handlePromptAction = async () => {
    if (editingPrompt) {
      const updated = promptText.trim() || (service() && service().DEFAULT_PROMPT) || DEFAULT_PROMPT;
      setPromptText(updated);
      setEditingPrompt(false);
      if (typeof hooks.savePrompt === 'function') {
        try { await hooks.savePrompt(updated); } catch (e) {}
      }
      if (options.readerPromptStyle) {
        if (typeof hooks.onPromptSaved === 'function') hooks.onPromptSaved(updated);
      } else {
        setPromptSavedFlash(true);
        setTimeout(() => setPromptSavedFlash(false), 1500);
      }
    } else {
      setEditingPrompt(true);
    }
  };

  const refreshBalance = useCallback((force) => {
    if (trackerRef.current) trackerRef.current.refresh(!!force);
  }, []);

  useImperativeHandle(ref, () => ({
    refreshBalance,
    getDownloadOptions(opts) {
      const built = buildDownloadOptions(
        { enabled, provider, customUrl, apiKey, model, prompt: promptText, cooldown },
        opts
      );
      if (!built) {
        setKeyError(true);
        if (keyInputRef.current) keyInputRef.current.focus();
        setTimeout(() => setKeyError(false), 2500);
        alert('Please enter your DeepSeek API Key before translating.');
        return null;
      }
      return built;
    },
    getConfig() {
      return { enabled, provider, customUrl, apiKey, model, prompt: promptText, cooldown: { ...cooldown } };
    }
  }), [refreshBalance, enabled, provider, customUrl, apiKey, model, promptText, cooldown]);

  const providerBadgeText = isOfficial ? texts.badgeOfficial : (isBridge ? texts.badgeBridge : texts.badgeCustom);
  const providerBadgeClass = compact
    ? (isOfficial
        ? 'text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        : 'text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30')
    : (isOfficial
        ? 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
        : 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30');

  const officialBtnClass = compact
    ? (isOfficial
        ? 'px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer bg-indigo-600 text-white shadow-sm'
        : 'px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer text-slate-400 hover:text-slate-200')
    : (isOfficial
        ? 'px-3 py-1 rounded-md font-semibold text-xs transition cursor-pointer bg-indigo-600 text-white shadow-sm'
        : 'px-3 py-1 rounded-md font-medium text-xs transition cursor-pointer text-slate-400 hover:text-slate-200');
  const customBtnClass = compact
    ? (!isOfficial
        ? 'px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer bg-purple-600 text-white shadow-sm'
        : 'px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer text-slate-400 hover:text-slate-200')
    : (!isOfficial
        ? 'px-3 py-1 rounded-md font-semibold text-xs transition cursor-pointer bg-purple-600 text-white shadow-sm'
        : 'px-3 py-1 rounded-md font-medium text-xs transition cursor-pointer text-slate-400 hover:text-slate-200');

  const toggleBadgeText = enabled ? texts.toggleOn : texts.toggleOff;
  const toggleBadgeClass = enabled
    ? (compact
        ? 'text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
        : 'text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30')
    : (compact
        ? 'text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600'
        : 'text-xs font-semibold px-2 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600');

  const pricingLabel = isOfficial ? pricing.label : texts.pricingFree;
  const pricingClass = `${compact ? 'text-[9px]' : 'text-[10px]'} font-semibold px-1.5 py-0.5 rounded border ${isOfficial ? pricing.badgeClass : 'border-purple-500/30 bg-purple-500/15 text-purple-300'}`;
  const pricingTitle = isOfficial ? pricing.title : texts.pricingFreeTitle;

  const cooldownBadge = (() => {
    if (!cooldown.enabled) {
      return {
        text: options.cooldownBadgeMode === 'compact' ? 'Off' : 'Disabled (No wait)',
        cls: compact
          ? 'text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-700 text-slate-400 border border-slate-600'
          : 'text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700'
      };
    }
    if (options.cooldownBadgeMode === 'compact') {
      return {
        text: `${Math.round(cooldown.minSec / 60)}–${Math.round(cooldown.maxSec / 60)}m`,
        cls: 'text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30'
      };
    }
    return {
      text: `Active (${formatSecondsHuman(cooldown.minSec)} ~ ${formatSecondsHuman(cooldown.maxSec)})`,
      cls: 'text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30'
    };
  })();

  const cooldownToggleLabelClass = cooldown.enabled
    ? (compact ? 'text-[10px] font-mono font-bold text-amber-400' : 'text-xs font-bold text-amber-400 font-mono')
    : (compact ? 'text-[10px] font-mono font-semibold text-slate-400' : 'text-xs font-semibold text-slate-400 font-mono');

  const balanceVisible = caps.balance && isOfficial && !!balance && (balance.success || !!balance.error) && (balance.success || !!apiKey.trim());
  let balanceClass = 'hidden';
  let balanceText = '...';
  let balanceTitle = '';
  if (balanceVisible) {
    if (balance.error && !balance.success) {
      balanceClass = `inline-flex items-center gap-1 ${compact ? 'text-[9px]' : 'text-[10px]'} font-semibold px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300 select-none`;
      balanceText = 'Auth Error';
      balanceTitle = balance.error;
    } else if (!balance.isAvailable || balance.numericBalance <= 0) {
      balanceClass = `inline-flex items-center gap-1 ${compact ? 'text-[9px]' : 'text-[10px]'} font-semibold px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/15 text-rose-300 select-none`;
      balanceText = `${balance.compact} (No Funds)`;
      balanceTitle = `DeepSeek Account Balance: ${balance.formatted} • Insufficient credits`;
    } else if (balance.isLow) {
      balanceClass = `inline-flex items-center gap-1 ${compact ? 'text-[9px]' : 'text-[10px]'} font-semibold px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/15 text-amber-300 select-none`;
      balanceText = `${balance.compact} (Low)`;
      balanceTitle = `DeepSeek Account Balance: ${balance.formatted} • Low balance warning`;
    } else {
      balanceClass = `inline-flex items-center gap-1 ${compact ? 'text-[9px]' : 'text-[10px]'} font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 select-none`;
      balanceText = balance.compact;
      balanceTitle = `DeepSeek Account Balance: ${balance.formatted} (Click to refresh)`;
    }
  }

  const statusClass = (status, kind) => {
    const base = compact ? 'text-[10px] px-2 py-1 rounded border' : 'text-[11px] px-2.5 py-1.5 rounded-md border';
    if (!status) return `hidden ${base}`;
    const tone = kind === 'success'
      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
      : kind === 'error'
        ? 'text-rose-300 bg-rose-500/10 border-rose-500/20'
        : kind === 'warn'
          ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
          : 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20';
    return `${base} ${tone} block mt-1`;
  };

  const keyErrorClasses = keyError ? ' border-rose-500 ring-1 ring-rose-500/50' : '';

  const cardClass = className || (compact
    ? 'rounded-lg bg-slate-800/90 border border-slate-700/80 p-3 shadow-sm flex flex-col gap-2.5'
    : 'rounded-xl bg-slate-800/70 border border-slate-700/70 p-5 shadow-sm flex flex-col gap-4');

  const renderProviderButtons = () => (
    <div className={compact ? 'grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-md border border-slate-700/80' : 'inline-flex rounded-lg bg-slate-900/90 p-1 border border-slate-700/70 gap-1 text-xs'}>
      <button type="button" id={ids.providerBtnOfficial} onClick={() => selectProvider('official')} className={officialBtnClass}>
        {compact ? 'Official DeepSeek' : 'Official DeepSeek API'}
      </button>
      <button type="button" id={ids.providerBtnCustom} onClick={() => selectProvider('custom')} className={customBtnClass}>
        {compact ? 'Custom API / Bridge' : 'Custom API'}
      </button>
    </div>
  );

  const renderBalanceBadge = () => (
    <div id={ids.balanceBadge} className={balanceClass} title={balanceTitle || 'DeepSeek Account Balance'}>
      <span className={compact ? '' : 'opacity-80'}>💳</span>
      <span id={ids.balanceText}>{balanceText}</span>
      <button type="button" id={ids.refreshBalanceBtn} onClick={() => refreshBalance(true)} className="hover:text-white transition ml-0.5 cursor-pointer" title="Refresh balance">
        <svg id={ids.refreshBalanceIcon} className={`w-2.5 h-2.5 inline${balanceUpdating ? ' animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
      </button>
    </div>
  );

  const modelOptions = models.map((id) => (
    <option key={id} value={id}>{modelLabel(id, options.modelLabelReasoner)}</option>
  ));

  if (compact) {
    return (
      <div className={cardClass}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0 text-xs">
              🌐
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-100">DeepSeek Translation</span>
                <span id={ids.toggleBadge} className={toggleBadgeClass}>{toggleBadgeText}</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">Translate chapter via API before saving</p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input type="checkbox" id={ids.toggle} className="sr-only peer" checked={enabled} onChange={(e) => handleToggleEnabled(e.target.checked)} />
            <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-purple-500"></div>
          </label>
        </div>

        <div id={ids.fields} className={`flex flex-col gap-2 pt-2 border-t border-slate-700/60 ${enabled ? 'opacity-100' : 'opacity-60'}`}>
          <div className="flex flex-col gap-1.5 p-2 rounded-md bg-slate-900/60 border border-slate-700/70">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
              <span>AI Provider</span>
              <span id={ids.providerBadge} className={providerBadgeClass}>{providerBadgeText}</span>
            </div>
            {renderProviderButtons()}
            <div id={ids.customRow} className={`${isOfficial ? 'hidden' : 'flex'} flex-col gap-1 pt-1 border-t border-slate-700/50`}>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <label htmlFor={ids.customUrl} className="font-mono">Base URL:</label>
                <div className="flex items-center gap-1.5">
                  <button type="button" id={ids.presetBtn} onClick={() => updateCustomUrl(DEFAULT_CUSTOM_URL)} className="text-[9px] text-purple-400 hover:text-purple-300 underline font-mono cursor-pointer" title="Use local bridge default (port 8000)">Preset (8000)</button>
                  <button type="button" id={ids.testCustomBtn} onClick={() => runTest('custom')} className="text-[9px] text-emerald-400 hover:text-emerald-300 underline font-mono cursor-pointer">{texts.testCustomButtonLabel}</button>
                </div>
              </div>
              <input
                type="text"
                id={ids.customUrl}
                value={customUrl}
                onChange={(e) => updateCustomUrl(e.target.value)}
                placeholder={DEFAULT_CUSTOM_URL}
                className="w-full px-2 py-1 text-[11px] font-mono bg-slate-950/80 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition"
              />
              <div id={ids.testCustomStatus || ids.testStatus} className={statusClass(customTestStatus, customTestStatus && customTestStatus.kind)}>{customTestStatus && customTestStatus.message}</div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label htmlFor={ids.modelSelect} className="text-[11px] font-semibold text-slate-300">Model</label>
              <div className="flex items-center gap-1 flex-wrap">
                <span id={ids.pricingBadge} className={pricingClass} title={pricingTitle}>{pricingLabel}</span>
                {renderBalanceBadge()}
                <span className="text-[10px] text-slate-400">DeepSeek V4.1</span>
              </div>
            </div>
            <select
              id={ids.modelSelect}
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-slate-900/90 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition cursor-pointer"
            >
              {modelOptions}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label htmlFor={ids.apiKey} id={ids.apiKeyLabel} className="text-[11px] font-semibold text-slate-300">
                {isOfficial ? texts.apiKeyLabelOfficial : texts.apiKeyLabelCustom}
              </label>
              <div className="flex items-center gap-1.5">
                <button type="button" id={ids.testBtn} onClick={() => runTest('key')} className="text-[10px] font-medium text-emerald-400 hover:text-emerald-300 transition cursor-pointer px-1.5 py-0.5 rounded hover:bg-slate-700/60" title="Test key and fetch live models">Test Key</button>
                <button type="button" id={ids.visibilityBtn} onClick={() => setShowKey((v) => !v)} className="text-[10px] text-indigo-400 hover:text-indigo-300 transition cursor-pointer">
                  {showKey ? texts.visibilityHide : texts.visibilityShow}
                </button>
              </div>
            </div>
            <input
              ref={keyInputRef}
              type={showKey ? 'text' : 'password'}
              id={ids.apiKey}
              value={apiKey}
              onChange={(e) => handleApiKeyInput(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              placeholder={isOfficial ? texts.apiKeyPlaceholderOfficial : texts.apiKeyPlaceholderCustom}
              className={`w-full px-2.5 py-1.5 text-xs bg-slate-900/90 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition font-mono${keyErrorClasses}`}
            />
            <div id={ids.testStatus} className={statusClass(testStatus, testStatus && testStatus.kind)}>{testStatus && testStatus.message}</div>
            <div className="flex items-center justify-between pt-0.5 text-[10px] text-slate-400">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none" title="Keep key saved across browser restarts">
                <input type="checkbox" id={ids.rememberKey} checked={rememberKey} onChange={(e) => handleRememberChange(e.target.checked)} className="w-3 h-3 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/40 focus:ring-offset-0 cursor-pointer" />
                <span>Remember key</span>
              </label>
              <button type="button" id={ids.clearKeyBtn} onClick={handleClearKey} className={`${apiKey.trim() ? '' : 'hidden '}text-rose-400 hover:text-rose-300 transition text-[10px] underline cursor-pointer`} title="Clear API key from memory and storage">Clear</button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label htmlFor={ids.prompt} className="text-[11px] font-semibold text-slate-300">2. Translation Prompt</label>
              <button type="button" id={ids.editPromptBtn} onClick={handlePromptAction} className={promptSavedFlash ? 'text-[10px] font-semibold text-emerald-400 px-1.5 py-0.5 rounded' : 'text-[10px] font-medium text-indigo-400 hover:text-indigo-300 transition cursor-pointer px-1.5 py-0.5 rounded hover:bg-slate-700/60'}>
                {promptSavedFlash ? 'Saved ✓' : (editingPrompt ? 'Save' : 'Edit')}
              </button>
            </div>
            <textarea
              id={ids.prompt}
              rows={2}
              readOnly={!editingPrompt}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Enter translation instructions/prompt for DeepSeek..."
              className={editingPrompt
                ? 'w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-indigo-500 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none ring-1 ring-indigo-500/50 transition resize-none leading-relaxed'
                : 'w-full px-2.5 py-1.5 text-xs bg-slate-900/90 border border-slate-700 rounded-md text-slate-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition resize-none leading-relaxed cursor-default'}
            ></textarea>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-700/60">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs">⏳</span>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-200">Rate Limit Cooldown</span>
                  <span id={ids.cooldownBadge} className={cooldownBadge.cls}>{cooldownBadge.text}</span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">Wait 3–5m between queued translations</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span id={ids.cooldownToggleLabel} className={cooldownToggleLabelClass}>{cooldown.enabled ? 'ON' : 'OFF'}</span>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0" title="Toggle 3-5m randomized cooldown between translated chapters">
                <input type="checkbox" id={ids.cooldownToggle} className="sr-only peer" checked={cooldown.enabled} onChange={(e) => persistCooldown({ ...cooldown, enabled: e.target.checked })} />
                <div className="w-8 h-4.5 cooldown-popup-track rounded-full peer-focus:outline-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all"></div>
              </label>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0 text-base">
            🌐
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">{copy.heading || 'DeepSeek Translation on Download'}</h3>
              <span id={ids.toggleBadge} className={toggleBadgeClass}>{toggleBadgeText}</span>
              <span id={ids.providerBadge} className={providerBadgeClass}>{providerBadgeText}</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{texts.description}</p>
          </div>
        </div>

        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input type="checkbox" id={ids.toggle} className="sr-only peer" checked={enabled} onChange={(e) => handleToggleEnabled(e.target.checked)} />
          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-purple-500"></div>
        </label>
      </div>

      {caps.provider ? (
        <div className="flex items-center justify-between pt-3 border-t border-slate-700/60">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">AI Provider:</span>
            <span className={providerBadgeClass}>{providerBadgeText}</span>
          </div>
          {renderProviderButtons()}
        </div>
      ) : null}

      <div id={ids.customRow} className={`${isOfficial ? 'hidden' : (options.customApiRowFlex ? 'flex' : 'flex')} flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-lg bg-slate-900/60 border border-purple-500/30`}>
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor={ids.customUrl} className="text-xs font-semibold text-purple-300">Custom Base URL</label>
            <button type="button" id={ids.presetBtn} onClick={() => updateCustomUrl(DEFAULT_CUSTOM_URL)} className="text-[11px] font-mono text-purple-400 hover:text-purple-200 transition underline cursor-pointer" title="Click to fill local web bridge default URL">Use Local Bridge (127.0.0.1:8000/v1)</button>
          </div>
          <input
            type="text"
            id={ids.customUrl}
            value={customUrl}
            onChange={(e) => updateCustomUrl(e.target.value)}
            placeholder={DEFAULT_CUSTOM_URL}
            className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition font-mono"
          />
        </div>
        <button type="button" id={ids.testCustomBtn} onClick={() => runTest('custom')} className="self-end sm:self-auto mt-2 sm:mt-4 px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-300 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 transition cursor-pointer">{texts.testCustomButtonLabel}</button>
      </div>

      <div id={ids.fields} className={`grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 ${enabled ? 'opacity-100' : 'opacity-60'}`}>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor={ids.modelSelect} className="text-xs font-semibold text-slate-300">Model</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span id={ids.pricingBadge} className={pricingClass} title={pricingTitle}>{pricingLabel}</span>
              {renderBalanceBadge()}
              <span className="text-[11px] text-slate-500">DeepSeek V4.1</span>
            </div>
          </div>
          <select
            id={ids.modelSelect}
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition cursor-pointer"
          >
            {modelOptions}
          </select>
          <div id={ids.testStatus} className={statusClass(testStatus, testStatus && testStatus.kind)}>{testStatus && testStatus.message}</div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor={ids.apiKey} id={ids.apiKeyLabel} className="text-xs font-semibold text-slate-300">
              {isOfficial ? texts.apiKeyLabelOfficial : texts.apiKeyLabelCustom}
            </label>
            <div className="flex items-center gap-2">
              <button type="button" id={ids.testBtn} onClick={() => runTest('key')} className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition cursor-pointer px-2 py-0.5 rounded hover:bg-slate-700/60" title="Test connection and check balance">Test Key</button>
              <button type="button" id={ids.visibilityBtn} onClick={() => setShowKey((v) => !v)} className="text-xs text-indigo-400 hover:text-indigo-300 transition cursor-pointer">
                {showKey ? texts.visibilityHide : texts.visibilityShow}
              </button>
            </div>
          </div>
          <input
            ref={keyInputRef}
            type={showKey ? 'text' : 'password'}
            id={ids.apiKey}
            value={apiKey}
            onChange={(e) => handleApiKeyInput(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            placeholder={isOfficial ? texts.apiKeyPlaceholderOfficial : texts.apiKeyPlaceholderCustom}
            className={`w-full px-3 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition font-mono${keyErrorClasses}`}
          />
          <div className="flex items-center justify-between pt-0.5 text-[11px] text-slate-400">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none" title="Keep key saved across browser restarts">
              <input type="checkbox" id={ids.rememberKey} checked={rememberKey} onChange={(e) => handleRememberChange(e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/40 focus:ring-offset-0 cursor-pointer" />
              <span>Remember on this device</span>
            </label>
            <button type="button" id={ids.clearKeyBtn} onClick={handleClearKey} className={`${apiKey.trim() ? '' : 'hidden '}text-rose-400 hover:text-rose-300 transition text-[11px] underline cursor-pointer`} title="Clear API key from memory and storage">Clear Key</button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor={ids.prompt} className="text-xs font-semibold text-slate-300">{copy.promptLabel || '2. Translation Prompt (Saved with Novel)'}</label>
            <button type="button" id={ids.editPromptBtn} onClick={handlePromptAction} className={promptSavedFlash ? 'text-xs font-semibold text-emerald-400 px-2 py-0.5 rounded' : 'text-xs font-medium text-indigo-400 hover:text-indigo-300 transition cursor-pointer px-2 py-0.5 rounded hover:bg-slate-700/60'}>
              {promptSavedFlash ? 'Saved ✓' : (editingPrompt ? 'Save' : 'Edit')}
            </button>
          </div>
          <textarea
            id={ids.prompt}
            rows={3}
            readOnly={!editingPrompt}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Enter translation instructions/prompt for DeepSeek..."
            className={editingPrompt
              ? 'w-full px-3 py-2 text-xs bg-slate-900 border border-indigo-500 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none ring-1 ring-indigo-500/50 transition resize-none leading-relaxed'
              : 'w-full px-3 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition resize-none leading-relaxed cursor-default'}
          ></textarea>
        </div>
      </div>

      {caps.cooldown ? (
        <div className={`rounded-xl bg-slate-900/90 border border-slate-700/80 p-4 flex flex-col gap-3.5 shadow-sm ${enabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0 text-sm">⏳</div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-100">Rate Limit Cooldown</span>
                  <span id={ids.cooldownBadge} className={cooldownBadge.cls}>{cooldownBadge.text}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">Pause a randomized duration between queued chapters to avoid API rate limits.</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <span id={ids.cooldownToggleLabel} className={cooldownToggleLabelClass}>{cooldown.enabled ? 'ON' : 'OFF'}</span>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0" title="Enable or disable rate limit cooldown between chapters">
                <input type="checkbox" id={ids.cooldownToggle} className="sr-only peer" checked={cooldown.enabled} onChange={(e) => persistCooldown({ ...cooldown, enabled: e.target.checked })} />
                <div className="w-11 h-6 cooldown-slider-track rounded-full peer-focus:outline-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>
          </div>

          <div id={ids.cooldownInputs} className={`grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-800 ${cooldown.enabled ? '' : 'opacity-30 pointer-events-none'}`}>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-300">Minimum Wait</span>
                <span id={ids.cooldownMinLabel} className="text-slate-400 font-mono font-medium">{formatSecondsHuman(cooldown.minSec)}</span>
              </div>
              <div className="flex items-center rounded-lg border border-slate-700 bg-slate-950 overflow-hidden focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500/40 transition">
                <input
                  type="number"
                  id={ids.cooldownMin}
                  min="10"
                  max="600"
                  step="5"
                  value={cooldown.minSec}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!Number.isNaN(value)) persistCooldown({ ...cooldown, minSec: Math.max(10, value), maxSec: Math.max(Math.max(10, value), cooldown.maxSec) });
                  }}
                  className="cooldown-number-input flex-1 min-w-0 px-3 py-1.5 text-xs font-mono font-bold"
                />
                <span className="px-2.5 py-1.5 text-[11px] font-mono font-semibold text-slate-400 bg-slate-900 border-l border-slate-700/80 select-none flex-shrink-0">seconds</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-300">Maximum Wait</span>
                <span id={ids.cooldownMaxLabel} className="text-slate-400 font-mono font-medium">{formatSecondsHuman(cooldown.maxSec)}</span>
              </div>
              <div className="flex items-center rounded-lg border border-slate-700 bg-slate-950 overflow-hidden focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500/40 transition">
                <input
                  type="number"
                  id={ids.cooldownMax}
                  min="10"
                  max="1200"
                  step="5"
                  value={cooldown.maxSec}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!Number.isNaN(value)) persistCooldown({ ...cooldown, maxSec: Math.max(cooldown.minSec, value) });
                  }}
                  className="cooldown-number-input flex-1 min-w-0 px-3 py-1.5 text-xs font-mono font-bold"
                />
                <span className="px-2.5 py-1.5 text-[11px] font-mono font-semibold text-slate-400 bg-slate-900 border-l border-slate-700/80 select-none flex-shrink-0">seconds</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export { DEFAULT_PROMPT };
export default AiConfigPanel;
