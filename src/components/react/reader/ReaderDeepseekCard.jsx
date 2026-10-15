import React, { forwardRef, useEffect, useRef, useState } from 'react';
import AiConfigPanel from '../shared/AiConfigPanel.jsx';

function getNovelId() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id');
}

const ID_SUFFIXES = {
  toggle: 'deepseek-toggle',
  toggleBadge: 'deepseek-toggle-badge',
  providerBadge: 'provider-badge',
  providerBtnOfficial: 'provider-btn-official',
  providerBtnCustom: 'provider-btn-custom',
  customRow: 'custom-api-row',
  customUrl: 'custom-base-url',
  presetBtn: 'bridge-preset-btn',
  testCustomBtn: 'test-custom-btn',
  apiKeyLabel: 'api-key-label',
  apiKey: 'deepseek-api-key',
  rememberKey: 'remember-deepseek-key',
  clearKeyBtn: 'clear-deepseek-btn',
  prompt: 'deepseek-prompt',
  visibilityBtn: 'toggle-key-visibility',
  fields: 'deepseek-config-fields',
  editPromptBtn: 'edit-prompt-btn',
  modelSelect: 'deepseek-model-select',
  testBtn: 'test-deepseek-btn',
  testStatus: 'deepseek-test-status',
  balanceBadge: 'deepseek-balance-badge',
  balanceText: 'deepseek-balance-text',
  refreshBalanceBtn: 'deepseek-refresh-balance-btn',
  refreshBalanceIcon: 'deepseek-refresh-balance-icon',
  pricingBadge: 'deepseek-pricing-badge'
};

function makePanelIds(prefix) {
  const ids = {};
  Object.keys(ID_SUFFIXES).forEach((key) => { ids[key] = `${prefix}-${ID_SUFFIXES[key]}`; });
  return ids;
}

const ReaderDeepseekCard = forwardRef(function ReaderDeepseekCard({ idPrefix = 'reader', variant = 'full', className }, ref) {
  const [novelId] = useState(getNovelId);
  const [prompt, setPrompt] = useState(null);
  const novelRef = useRef(null);
  const ids = makePanelIds(idPrefix);

  useEffect(() => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId || typeof storage.getNovelById !== 'function') return undefined;
    let cancelled = false;
    storage.getNovelById(novelId)
      .then((record) => {
        if (cancelled) return;
        novelRef.current = record || null;
        setPrompt(record ? (record.translationPrompt || null) : null);
      })
      .catch((e) => console.error('[ReaderDeepseekCard] Failed to load novel:', e));
    return () => { cancelled = true; };
  }, [novelId]);

  const hooks = {
    getPrompt: () => (novelRef.current && novelRef.current.translationPrompt) || null,
    savePrompt: async (text) => {
      const novel = novelRef.current;
      if (!novel) return;
      novel.translationPrompt = text;
      const service = typeof window !== 'undefined' ? window.StorageService : null;
      if (service && typeof service.updateNovel === 'function') {
        await service.updateNovel(novel.id, { translationPrompt: text });
      }
    },
    onPromptSaved: () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('reader-show-toast', { detail: 'Translation prompt saved ✓' }));
      }
    }
  };

  return (
    <AiConfigPanel
      ref={ref}
      variant={variant}
      capabilities={{ cooldown: false }}
      options={{ readerPromptStyle: true }}
      ids={ids}
      hooks={hooks}
      prompt={prompt}
      className={className || 'w-full text-left rounded-xl bg-slate-800/80 border border-slate-700/80 p-5 shadow-sm flex flex-col gap-4'}
      copy={{ description: 'When enabled, this chapter will be automatically translated via DeepSeek API before saving.' }}
    />
  );
});

export default ReaderDeepseekCard;
