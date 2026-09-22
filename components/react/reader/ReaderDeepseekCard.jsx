import React, { forwardRef, useEffect, useRef, useState } from 'react';
import AiConfigPanel from '../shared/AiConfigPanel.jsx';

function getNovelId() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id');
}

const PANEL_IDS = {
  toggle: 'reader-deepseek-toggle',
  toggleBadge: 'reader-deepseek-toggle-badge',
  providerBadge: 'reader-provider-badge',
  providerBtnOfficial: 'reader-provider-btn-official',
  providerBtnCustom: 'reader-provider-btn-custom',
  customRow: 'reader-custom-api-row',
  customUrl: 'reader-custom-base-url',
  presetBtn: 'reader-bridge-preset-btn',
  testCustomBtn: 'reader-test-custom-btn',
  apiKeyLabel: 'reader-api-key-label',
  apiKey: 'reader-deepseek-api-key',
  rememberKey: 'reader-remember-deepseek-key',
  clearKeyBtn: 'reader-clear-deepseek-btn',
  prompt: 'reader-deepseek-prompt',
  visibilityBtn: 'reader-toggle-key-visibility',
  fields: 'reader-deepseek-config-fields',
  editPromptBtn: 'reader-edit-prompt-btn',
  modelSelect: 'reader-deepseek-model-select',
  testBtn: 'reader-test-deepseek-btn',
  testStatus: 'reader-deepseek-test-status',
  balanceBadge: 'reader-deepseek-balance-badge',
  balanceText: 'reader-deepseek-balance-text',
  refreshBalanceBtn: 'reader-deepseek-refresh-balance-btn',
  refreshBalanceIcon: 'reader-deepseek-refresh-balance-icon',
  pricingBadge: 'reader-deepseek-pricing-badge'
};

const ReaderDeepseekCard = forwardRef(function ReaderDeepseekCard(_props, ref) {
  const [novelId] = useState(getNovelId);
  const [prompt, setPrompt] = useState(null);
  const novelRef = useRef(null);

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
      variant="full"
      capabilities={{ cooldown: false }}
      options={{ readerPromptStyle: true }}
      ids={PANEL_IDS}
      hooks={hooks}
      prompt={prompt}
      className="w-full text-left rounded-xl bg-slate-800/80 border border-slate-700/80 p-5 shadow-sm flex flex-col gap-4"
      copy={{ description: 'When enabled, this chapter will be automatically translated via DeepSeek API before saving.' }}
    />
  );
});

export default ReaderDeepseekCard;
