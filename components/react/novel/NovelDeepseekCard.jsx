import React, { forwardRef, useEffect, useRef, useState } from 'react';
import AiConfigPanel from '../shared/AiConfigPanel.jsx';

function getNovelId() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id');
}

const PANEL_IDS = {
  toggle: 'deepseek-toggle',
  toggleBadge: 'deepseek-toggle-badge',
  providerBadge: 'novel-provider-badge',
  providerBtnOfficial: 'novel-provider-btn-official',
  providerBtnCustom: 'novel-provider-btn-custom',
  customRow: 'novel-custom-api-row',
  customUrl: 'novel-custom-base-url',
  presetBtn: 'novel-bridge-preset-btn',
  testCustomBtn: 'novel-test-custom-btn',
  apiKeyLabel: 'novel-api-key-label',
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
  pricingBadge: 'deepseek-pricing-badge',
  cooldownToggle: 'novel-cooldown-toggle',
  cooldownToggleLabel: 'novel-cooldown-toggle-label',
  cooldownMin: 'novel-cooldown-min',
  cooldownMax: 'novel-cooldown-max',
  cooldownMinLabel: 'novel-cooldown-min-label',
  cooldownMaxLabel: 'novel-cooldown-max-label',
  cooldownBadge: 'novel-cooldown-badge',
  cooldownInputs: 'novel-cooldown-inputs-container'
};

const NovelDeepseekCard = forwardRef(function NovelDeepseekCard(_props, ref) {
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
      .catch((e) => console.error('[NovelDeepseekCard] Failed to load novel:', e));
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
    }
  };

  return (
    <AiConfigPanel
      ref={ref}
      variant="full"
      ids={PANEL_IDS}
      hooks={hooks}
      prompt={prompt}
      copy={{ description: 'When enabled, chapters are automatically translated via DeepSeek API before saving to library.' }}
    />
  );
});

export default NovelDeepseekCard;
