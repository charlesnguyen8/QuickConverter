import React, { useCallback, useEffect, useRef, useState } from 'react';

const OFFICIAL = 'official';
const CUSTOM = 'custom';
const CUSTOM_DEFAULT_URL = 'http://127.0.0.1:8000/v1';

const PROVIDER_CARD_ACTIVE = 'flex flex-col gap-2 p-3.5 rounded-xl border border-indigo-500/50 bg-indigo-500/10 cursor-pointer transition relative';
const PROVIDER_CARD_IDLE = 'flex flex-col gap-2 p-3.5 rounded-xl border border-slate-700/60 bg-slate-900/40 cursor-pointer transition relative hover:border-slate-600';
const MODEL_CARD_ACTIVE = 'flex flex-col gap-2 p-4 rounded-xl border border-indigo-500/50 bg-indigo-500/10 cursor-pointer transition relative';
const MODEL_CARD_IDLE = 'flex flex-col gap-2 p-4 rounded-xl border border-slate-700/60 bg-slate-900/40 cursor-pointer transition relative hover:border-slate-600';

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
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(val)); } catch (e) {}
}

function readCooldown() {
  let cfg = { enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 };
  try {
    const raw = getStored('quickconverter_queue_cooldown', null);
    if (raw) cfg = { ...cfg, ...JSON.parse(raw) };
  } catch (e) {}
  return cfg;
}

function formatSecHuman(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m > 0 ? `sec (${h}h ${m}m)` : `sec (${h}h)`;
  }
  const m = Math.floor(s / 60);
  return `sec (${m}m)`;
}

export default function SettingsDeepSeekTab({ onSaved }) {
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState(OFFICIAL);
  const [bridgeUrl, setBridgeUrl] = useState(CUSTOM_DEFAULT_URL);
  const [bridgeStatus, setBridgeStatus] = useState({ text: 'Not checked yet', cls: 'text-xs font-medium text-slate-400' });
  const [testingBridge, setTestingBridge] = useState(false);
  const [model, setModel] = useState('deepseek-flash');
  const [apiKey, setApiKey] = useState('');
  const [rememberKey, setRememberKey] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState({ text: '', cls: 'text-xs font-medium' });
  const [balanceInfo, setBalanceInfo] = useState(null);
  const [balanceUpdating, setBalanceUpdating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [cooldown, setCooldown] = useState({ enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });

  const trackerRef = useRef(null);
  const apiKeyRef = useRef('');
  apiKeyRef.current = apiKey;

  const notify = useCallback((message) => {
    if (typeof onSaved === 'function') onSaved(message);
  }, [onSaved]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ds = service();

      if (ds && typeof ds.getProviderConfig === 'function') {
        try {
          const cfg = await ds.getProviderConfig();
          if (!cancelled) {
            setProvider(cfg.provider === OFFICIAL ? OFFICIAL : CUSTOM);
            setBridgeUrl(cfg.customUrl || cfg.baseUrl || CUSTOM_DEFAULT_URL);
          }
        } catch (e) {
          console.error('Failed to load provider config:', e);
        }
      }

      if (cancelled) return;
      setEnabled(getStored('quickconverter_deepseek_enabled', 'false') === 'true');
      setModel(getStored('quickconverter_deepseek_model', 'deepseek-flash'));
      setPrompt(getStored('quickconverter_deepseek_prompt', (ds && ds.DEFAULT_PROMPT) || ''));

      let storedKey = '';
      let storedRemember = getStored('quickconverter_deepseek_key_storage', 'device') !== 'session';
      if (ds && typeof ds.getApiKey === 'function') {
        try {
          const keyData = await ds.getApiKey();
          storedKey = (typeof keyData === 'object' ? keyData.apiKey : keyData) || '';
          if (typeof keyData === 'object' && typeof keyData.remembered === 'boolean') storedRemember = keyData.remembered;
        } catch (e) {
          console.error('Failed to load DeepSeek API key:', e);
        }
      }
      if (cancelled) return;
      setApiKey(storedKey);
      setRememberKey(storedRemember);
      if (storedKey) setKeyStatus({ text: '● Key configured', cls: 'text-xs font-medium text-emerald-400' });

      setCooldown(readCooldown());

      if (ds && typeof ds.createBalanceTracker === 'function') {
        trackerRef.current = ds.createBalanceTracker(
          () => apiKeyRef.current.trim(),
          (info, updating) => {
            setBalanceUpdating(!!updating);
            if (info) setBalanceInfo(info);
          }
        );
        if (storedKey.trim()) trackerRef.current.refresh(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handleToggleEnabled = (checked) => {
    setEnabled(checked);
    setStored('quickconverter_deepseek_enabled', checked ? 'true' : 'false');
    notify('Translation preference saved');
  };

  const handleProvider = async (next) => {
    const ds = service();
    setProvider(next);
    try {
      if (ds && typeof ds.setProviderConfig === 'function') {
        if (next === OFFICIAL) {
          await ds.setProviderConfig({ provider: ds.PROVIDER_OFFICIAL || OFFICIAL });
        } else {
          const url = (bridgeUrl || '').trim() || CUSTOM_DEFAULT_URL;
          await ds.setProviderConfig({ provider: ds.PROVIDER_CUSTOM || CUSTOM, customUrl: url });
        }
      }
    } catch (e) {}
    notify(next === OFFICIAL ? 'Provider switched to Official DeepSeek API' : 'Provider switched to Custom API / Local Bridge');
    if (next === OFFICIAL && trackerRef.current) trackerRef.current.refresh(true);
  };

  const handlePreset = async () => {
    setBridgeUrl(CUSTOM_DEFAULT_URL);
    const ds = service();
    try {
      if (ds && typeof ds.setProviderConfig === 'function') await ds.setProviderConfig({ customUrl: CUSTOM_DEFAULT_URL });
    } catch (e) {}
    notify('Reset to Local Bridge preset URL');
  };

  const handleBridgeUrlCommit = async () => {
    const url = (bridgeUrl || '').trim() || CUSTOM_DEFAULT_URL;
    setBridgeUrl(url);
    const ds = service();
    try {
      if (ds && typeof ds.setProviderConfig === 'function') await ds.setProviderConfig({ customUrl: url, baseUrl: url });
    } catch (e) {}
    notify('Custom API Base URL updated');
  };

  const handleTestBridge = async () => {
    const ds = service();
    const targetUrl = (bridgeUrl || '').trim() || CUSTOM_DEFAULT_URL;
    setTestingBridge(true);
    setBridgeStatus({ text: `Connecting to endpoint at ${targetUrl}...`, cls: 'text-xs font-medium text-indigo-400' });
    try {
      if (!ds || typeof ds.testConnection !== 'function') throw new Error('DeepSeekService not loaded');
      const res = await ds.testConnection(null, { provider: ds.PROVIDER_CUSTOM || CUSTOM, baseUrl: targetUrl });
      if (res && res.success) {
        setBridgeStatus({ text: `✓ Connected! Endpoint healthy (${(res.models || []).length || res.modelCount || 0} models ready)`, cls: 'text-xs font-medium text-emerald-400' });
        notify('Custom endpoint verified!');
      } else {
        setBridgeStatus({ text: `✕ Error: ${(res && res.error) || 'Unknown error'}`, cls: 'text-xs font-medium text-red-400' });
      }
    } catch (err) {
      setBridgeStatus({ text: `✕ Connection failed: ${err.message}`, cls: 'text-xs font-medium text-red-400' });
    } finally {
      setTestingBridge(false);
    }
  };

  const handleModel = (value) => {
    setModel(value);
    setStored('quickconverter_deepseek_model', value);
    let label = 'Flash';
    if (value === 'deepseek-chat') label = 'Chat';
    if (value === 'deepseek-reasoner') label = 'Reasoner (R1)';
    notify(`Default model set to ${label}`);
  };

  const handleRemember = async (checked) => {
    setRememberKey(checked);
    if (!apiKey.trim()) return;
    const ds = service();
    try {
      if (ds && typeof ds.setApiKey === 'function') await ds.setApiKey(apiKey.trim(), checked);
    } catch (e) {}
    notify(checked ? 'Key saved to local device' : 'Key saved for session only');
  };

  const handleKeyCommit = async () => {
    const val = apiKey.trim();
    if (!val) return;
    const ds = service();
    try {
      if (ds && typeof ds.setApiKey === 'function') await ds.setApiKey(val, rememberKey);
    } catch (e) {}
    notify('API Key updated');
    if (trackerRef.current) trackerRef.current.refresh(true);
  };

  const handleClearKey = async () => {
    const ds = service();
    try {
      if (ds && typeof ds.clearApiKey === 'function') await ds.clearApiKey();
    } catch (e) {}
    setApiKey('');
    setKeyStatus({ text: 'Key removed', cls: 'text-xs font-medium text-slate-400' });
    setBalanceInfo({ success: false, isAvailable: false });
    setBalanceUpdating(false);
    notify('API Key cleared');
  };

  const handleVerifyKey = async () => {
    const ds = service();
    const key = apiKey.trim();
    if (!key) {
      setKeyStatus({ text: 'Please enter an API key first', cls: 'text-xs font-medium text-amber-400' });
      return;
    }
    setTestingBridge(false);
    setVerifyingKey(true);
    setKeyStatus({ text: 'Contacting DeepSeek API...', cls: 'text-xs font-medium text-indigo-400' });
    try {
      if (!ds || typeof ds.getBalance !== 'function') throw new Error('DeepSeekService not loaded');
      const balanceData = await ds.getBalance(key, { force: true });
      if (!balanceData || !balanceData.success) throw new Error(balanceData ? balanceData.error : 'Verification failed');
      if (typeof ds.setApiKey === 'function') await ds.setApiKey(key, rememberKey);
      setKeyStatus({ text: `✓ Verified (${balanceData.compact})`, cls: 'text-xs font-medium text-emerald-400' });
      setBalanceInfo(balanceData);
      notify('Key verified successfully!');
    } catch (err) {
      console.error('Key verification error:', err);
      setKeyStatus({ text: `✕ Verification Failed: ${err.message}`, cls: 'text-xs font-medium text-red-400' });
    } finally {
      setVerifyingKey(false);
    }
  };

  const handleRefreshBalance = async () => {
    if (trackerRef.current) {
      await trackerRef.current.refresh(true);
      notify('Balance refreshed');
    }
  };

  const handlePromptBlur = () => {
    const value = prompt.trim();
    setPrompt(value);
    setStored('quickconverter_deepseek_prompt', value);
    notify('Default prompt updated');
  };

  const handleResetPrompt = () => {
    const ds = service();
    const value = (ds && ds.DEFAULT_PROMPT) || '';
    setPrompt(value);
    setStored('quickconverter_deepseek_prompt', value);
    notify('Prompt reset to default');
  };

  const persistCooldown = (next) => {
    setCooldown(next);
    const ds = service();
    const q = typeof window !== 'undefined' ? window.DownloadQueueService : null;
    if (q && typeof q.setCooldownConfig === 'function') q.setCooldownConfig(next);
    else setStored('quickconverter_queue_cooldown', JSON.stringify(next));
    notify('Queue cooldown settings saved');
  };

  const cooldownNumber = (value, min, current, key) => {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    persistCooldown({ ...current, [key]: Math.max(min, parsed) });
  };

  const toggleBadge = enabled
    ? { text: 'Active', cls: 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' }
    : { text: 'Disabled', cls: 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-700 text-slate-400 border border-slate-600' };

  const statusBadge = provider === OFFICIAL
    ? { text: 'Official Cloud API', cls: 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' }
    : { text: 'Custom API / Local Bridge', cls: 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30' };

  const balanceView = (() => {
    const data = balanceInfo;
    if (!data || !data.success || !data.isAvailable) {
      const balanceText = data && data.success && !data.isAvailable
        ? `${data.compact || '$0.00'} (No Funds)`
        : 'No Balance Available';
      return {
        balanceText,
        granted: data && data.error ? `(${data.error})` : '(Key not set or invalid)',
        headerVal: 'Unconfigured',
        headerVisible: false
      };
    }
    const total = parseFloat(data.totalBalance || '0').toFixed(2);
    const granted = parseFloat(data.grantedBalance || '0').toFixed(2);
    const currency = data.currency || 'USD';
    const symbol = data.currencySymbol || '$';
    return {
      balanceText: `${symbol}${total} ${currency}`,
      granted: `(Includes ${symbol}${granted} granted)`,
      headerVal: `${symbol}${total}`,
      headerVisible: true
    };
  })();

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>🌐</span>
            <span>DeepSeek AI Translation</span>
          </h2>

          <div
            id="deepseek-header-balance"
            className={`${balanceView.headerVisible ? 'inline-flex' : 'hidden sm:inline-flex'} items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shadow-sm`}
            title="Active DeepSeek Account Balance"
          >
            <span>💳</span>
            <span id="deepseek-header-balance-val">{balanceView.headerVal}</span>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Configure global defaults, API credentials, balance auto-refresh, and translation prompt rules.
        </p>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-200">AI Translation by Default</span>
            <span id="deepseek-toggle-badge" className={toggleBadge.cls}>{toggleBadge.text}</span>
          </div>
          <p className="text-xs text-slate-400">
            When enabled, newly queued chapters are translated using DeepSeek AI. You can still toggle this per-novel at any time.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input type="checkbox" id="deepseek-master-toggle" className="sr-only peer" checked={enabled} onChange={(e) => handleToggleEnabled(e.target.checked)} />
          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
        </label>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">AI Provider & Connection</h3>
            <p className="text-xs text-slate-400">Choose between the official cloud API or your custom OpenAI-compatible endpoint (e.g. Local Web Bridge).</p>
          </div>
          <span id="provider-status-badge" className={statusBadge.cls}>{statusBadge.text}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label id="provider-card-official" className={provider === OFFICIAL ? PROVIDER_CARD_ACTIVE : PROVIDER_CARD_IDLE}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input type="radio" name="ai-provider" value="official" id="provider-radio-official" className="text-indigo-600 focus:ring-indigo-500" checked={provider === OFFICIAL} onChange={() => handleProvider(OFFICIAL)} />
                <span className="text-sm font-bold text-slate-100">Official DeepSeek API</span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-700/80 text-slate-300 border border-slate-600">Cloud API</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              High-throughput cloud requests with context caching discounts. Requires DeepSeek platform API key and account balance.
            </p>
            <div className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-700/60 flex items-center justify-between">
              <span>api.deepseek.com</span>
              <span className="text-emerald-400 font-semibold">Pay-per-token</span>
            </div>
          </label>

          <label id="provider-card-bridge" className={provider === CUSTOM ? PROVIDER_CARD_ACTIVE : PROVIDER_CARD_IDLE}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input type="radio" name="ai-provider" value="custom" id="provider-radio-bridge" className="text-indigo-600 focus:ring-indigo-500" checked={provider === CUSTOM} onChange={() => handleProvider(CUSTOM)} />
                <span className="text-sm font-bold text-slate-200">Custom API / Local Bridge</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">Custom • Free</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Connect to any OpenAI-compatible base URL (Local Web Bridge, Ollama, LM Studio). API key is optional for local endpoints.
            </p>
            <div className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-700/60 flex items-center justify-between">
              <span>127.0.0.1:8000/v1 or custom</span>
              <span className="text-emerald-400 font-semibold">No Token Fees</span>
            </div>
          </label>
        </div>

        <div id="bridge-config-panel" className={`${provider === CUSTOM ? 'flex' : 'hidden'} flex-col gap-3 pt-2 border-t border-slate-700/60`}>
          <div className="flex items-center justify-between">
            <label htmlFor="bridge-url-input" className="text-xs font-semibold text-slate-300">Custom API Base URL</label>
            <div className="flex items-center gap-2">
              <button type="button" id="bridge-preset-btn" onClick={handlePreset} className="text-[10px] text-purple-400 hover:text-purple-300 underline font-mono cursor-pointer">Preset: Local Bridge (8000)</button>
              <span id="bridge-status-feedback" className={bridgeStatus.cls}>{bridgeStatus.text}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              id="bridge-url-input"
              value={bridgeUrl}
              onChange={(e) => setBridgeUrl(e.target.value)}
              onBlur={handleBridgeUrlCommit}
              placeholder={CUSTOM_DEFAULT_URL}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-700 text-xs text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <button type="button" id="test-bridge-btn" onClick={handleTestBridge} disabled={testingBridge} className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition focus:outline-none cursor-pointer flex-shrink-0 shadow-sm disabled:opacity-50">
              {testingBridge ? 'Testing...' : 'Test Base URL'}
            </button>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-700/50 text-[11px] text-slate-400 flex items-center justify-between">
            <span>💡 Works with <code>start_chromium.bat</code> or any OpenAI-compatible <code>/v1/chat/completions</code> server.</span>
            <span className="text-emerald-400 font-medium">Auto-deletes chats</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Default Model</h3>
          <p className="text-xs text-slate-400">Select the model used for new translation tasks.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label id="model-card-flash" className={model === 'deepseek-flash' ? MODEL_CARD_ACTIVE : MODEL_CARD_IDLE}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input type="radio" name="deepseek-model" value="deepseek-flash" id="model-radio-flash" className="text-indigo-600 focus:ring-indigo-500" checked={model === 'deepseek-flash'} onChange={() => handleModel('deepseek-flash')} />
                <span className="text-sm font-bold text-slate-100">DeepSeek Flash</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">⚡ 50x Cheaper Cache</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Ultra fast throughput, lowest latency, and up to 50x cheaper token cost when context cache hits. Ideal for novel binge-reading.
            </p>
            <div className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-700/60 flex items-center justify-between">
              <span>Input: $0.14 / M</span>
              <span className="text-emerald-400 font-semibold">Cached: $0.014 / M</span>
            </div>
          </label>

          <label id="model-card-chat" className={model === 'deepseek-chat' ? MODEL_CARD_ACTIVE : MODEL_CARD_IDLE}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input type="radio" name="deepseek-model" value="deepseek-chat" id="model-radio-chat" className="text-indigo-600 focus:ring-indigo-500" checked={model === 'deepseek-chat'} onChange={() => handleModel('deepseek-chat')} />
                <span className="text-sm font-bold text-slate-200">DeepSeek Chat</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Standard</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Standard flagship conversational and literary translation model with nuanced grammar awareness for complex prose.
            </p>
            <div className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-700/60 flex items-center justify-between">
              <span>Input: $0.27 / M</span>
              <span className="text-emerald-400 font-semibold">Cached: $0.07 / M</span>
            </div>
          </label>

          <label id="model-card-reasoner" className={`${model === 'deepseek-reasoner' ? MODEL_CARD_ACTIVE : MODEL_CARD_IDLE} col-span-1 sm:col-span-2`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input type="radio" name="deepseek-model" value="deepseek-reasoner" id="model-radio-reasoner" className="text-indigo-600 focus:ring-indigo-500" checked={model === 'deepseek-reasoner'} onChange={() => handleModel('deepseek-reasoner')} />
                <span className="text-sm font-bold text-slate-200">DeepSeek Reasoner (R1 DeepThink)</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">🧠 DeepThink Reasoning</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Activates in-depth reasoning and context synthesis before generating final English text. Excellent for cultivation terminology, poetic allegories, and difficult idioms.
            </p>
            <div className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-700/60 flex items-center justify-between">
              <span>Reasoning Mode: Chain-of-Thought</span>
              <span className="text-purple-400 font-semibold">Free via Local Bridge</span>
            </div>
          </label>
        </div>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">DeepSeek API Key</h3>
          <p className="text-xs text-slate-400">
            Your key is stored securely on this device and used exclusively for direct requests to DeepSeek's official API.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                id="settings-api-key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onBlur={handleKeyCommit}
                placeholder="sk-..."
                autoComplete="off"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900/90 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono pr-10 transition"
              />
              <button type="button" id="toggle-key-visibility-btn" onClick={() => setShowKey((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 rounded focus:outline-none cursor-pointer" title="Show / Hide API Key">
                <svg id="eye-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>

            <button type="button" id="test-key-btn" onClick={handleVerifyKey} disabled={verifyingKey} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer flex-shrink-0 disabled:opacity-50">
              <span>{verifyingKey ? 'Verifying...' : 'Verify Key'}</span>
            </button>

            <button type="button" id="clear-key-btn" onClick={handleClearKey} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition focus:outline-none cursor-pointer flex-shrink-0" title="Remove Key from Storage">
              <span>Clear</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
              <input type="checkbox" id="settings-remember-key" className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500" checked={rememberKey} onChange={(e) => handleRemember(e.target.checked)} />
              <span>Remember API Key on this computer (Local Storage)</span>
            </label>
            <span id="key-validation-status" className={keyStatus.cls}>{keyStatus.text}</span>
          </div>
        </div>

        <div id="settings-balance-card" className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl text-emerald-400 flex-shrink-0">💳</div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Available Account Balance</span>
                <span id="balance-live-dot" className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Live Auto-Refreshing"></span>
              </div>
              <div className="flex items-baseline gap-2">
                <span id="settings-balance-text" className="text-lg font-bold font-mono text-emerald-400">{balanceView.balanceText}</span>
                <span id="settings-granted-text" className="text-xs text-slate-400">{balanceView.granted}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <span className="text-[11px] text-slate-500 hidden lg:inline">Auto-refreshes periodically</span>
            <button type="button" id="refresh-balance-btn" onClick={handleRefreshBalance} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition focus:outline-none cursor-pointer" title="Refresh Balance from DeepSeek">
              <svg id="refresh-icon" className={`w-3 h-3${balanceUpdating ? ' animate-spin' : ''}`} xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"></path>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Default Translation System Prompt</h3>
            <p className="text-xs text-slate-400">
              Global instructions instructing the AI how to translate web novel chapters.
            </p>
          </div>
          <button type="button" id="reset-prompt-btn" onClick={handleResetPrompt} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition cursor-pointer">
            Reset to Default
          </button>
        </div>

        <textarea
          id="settings-custom-prompt"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={handlePromptBlur}
          className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900/90 border border-slate-700/80 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition leading-relaxed"
          placeholder="Enter custom translation instructions..."
        ></textarea>

        <p className="text-[11px] text-slate-400">
          💡 Tip: Individual novels can override this prompt in their respective Novel Overview page.
        </p>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">DeepSeek Translation Rate Limit & Cooldown</h3>
            <p className="text-xs text-slate-400">Randomized delay between queued chapters when DeepSeek Translation is enabled to avoid API rate limits.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input type="checkbox" id="queue-cooldown-toggle" className="sr-only peer" checked={cooldown.enabled} onChange={(e) => persistCooldown({ ...cooldown, enabled: e.target.checked })} />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        <div id="queue-cooldown-inputs-container" className={`grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-700/60 ${cooldown.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="queue-cooldown-min" className="text-xs font-semibold text-slate-300">Minimum Wait</label>
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/50">
              <input
                type="number"
                id="queue-cooldown-min"
                min="10"
                max="600"
                step="5"
                value={cooldown.minSec}
                onChange={(e) => cooldownNumber(e.target.value, 10, cooldown, 'minSec')}
                className="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm font-mono font-bold text-slate-100 focus:outline-none"
              />
              <span className="px-3 py-2 text-xs font-mono font-semibold text-slate-400 bg-slate-800 border-l border-slate-700 select-none flex-shrink-0">sec (3m)</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="queue-cooldown-max" className="text-xs font-semibold text-slate-300">Maximum Wait</label>
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/50">
              <input
                type="number"
                id="queue-cooldown-max"
                min="10"
                max="1200"
                step="5"
                value={cooldown.maxSec}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  if (!Number.isNaN(parsed)) persistCooldown({ ...cooldown, maxSec: Math.max(cooldown.minSec, parsed) });
                }}
                className="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm font-mono font-bold text-slate-100 focus:outline-none"
              />
              <span className="px-3 py-2 text-xs font-mono font-semibold text-slate-400 bg-slate-800 border-l border-slate-700 select-none flex-shrink-0">sec (5m)</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-700/60">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="queue-error-cooldown" className="text-xs font-semibold text-slate-300">Rate Limit / Failure Backoff Duration</label>
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 overflow-hidden focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500/50">
              <input
                type="number"
                id="queue-error-cooldown"
                min="60"
                max="86400"
                step="60"
                value={cooldown.errorCooldownSec}
                onChange={(e) => cooldownNumber(e.target.value, 60, cooldown, 'errorCooldownSec')}
                className="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm font-mono font-bold text-slate-100 focus:outline-none"
              />
              <span id="queue-error-cooldown-unit" className="px-3 py-2 text-xs font-mono font-semibold text-slate-400 bg-slate-800 border-l border-slate-700 select-none flex-shrink-0">{formatSecHuman(cooldown.errorCooldownSec)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="queue-max-retries" className="text-xs font-semibold text-slate-300">Max Automatic Retries</label>
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 overflow-hidden focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500/50">
              <input
                type="number"
                id="queue-max-retries"
                min="1"
                max="10"
                step="1"
                value={cooldown.maxRetries}
                onChange={(e) => cooldownNumber(e.target.value, 1, cooldown, 'maxRetries')}
                className="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm font-mono font-bold text-slate-100 focus:outline-none"
              />
              <span className="px-3 py-2 text-xs font-mono font-semibold text-slate-400 bg-slate-800 border-l border-slate-700 select-none flex-shrink-0">attempts</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-700/40">
          💡 When enabled with DeepSeek Translation, the queue will wait for a randomized duration between <strong>180s (3m)</strong> and <strong>300s (5m)</strong> after completing each translated chapter. If an API rate limit or error occurs, the failed chapter is placed back at the top of the queue and pauses for <strong>1 hour 15 minutes</strong> before retrying automatically. You can click <strong>Retry Now 🔄</strong> or <strong>Skip ⏩</strong> in the floating Queue Dock at any time.
        </p>
      </div>

      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <span>🕒</span>
          <span>Off-Peak Discount & Token Pricing Notice</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          DeepSeek offers an automatic <strong className="text-emerald-400">50% off-peak discount</strong> during Beijing non-business hours (UTC 16:30 – 08:30). QuickConverter automatically factors in off-peak rates and context caching discounts when calculating per-chapter costs.
        </p>
      </div>
    </>
  );
}
