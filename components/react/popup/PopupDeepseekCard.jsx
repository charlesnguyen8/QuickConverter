import React, { forwardRef, useEffect, useRef, useState } from 'react';
import AiConfigPanel from '../shared/AiConfigPanel.jsx';

const PANEL_IDS = {
  toggle: 'deepseek-toggle',
  toggleBadge: 'deepseek-toggle-badge',
  providerBadge: 'popup-provider-badge',
  providerBtnOfficial: 'popup-provider-btn-official',
  providerBtnCustom: 'popup-provider-btn-custom',
  customRow: 'popup-custom-api-row',
  customUrl: 'popup-custom-base-url',
  presetBtn: 'popup-bridge-preset-btn',
  testCustomBtn: 'popup-test-custom-btn',
  testCustomStatus: 'popup-custom-test-status',
  apiKeyLabel: 'popup-api-key-label',
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
  cooldownToggle: 'popup-cooldown-toggle',
  cooldownToggleLabel: 'popup-cooldown-toggle-label',
  cooldownBadge: 'popup-cooldown-badge'
};

const PopupDeepseekCard = forwardRef(function PopupDeepseekCard({ novelId }, ref) {
  const [prompt, setPrompt] = useState(null);
  const novelRef = useRef(null);

  useEffect(() => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId || typeof storage.getNovelById !== 'function') {
      novelRef.current = null;
      setPrompt(null);
      return undefined;
    }
    let cancelled = false;
    storage.getNovelById(novelId)
      .then((record) => {
        if (cancelled) return;
        novelRef.current = record || null;
        setPrompt(record ? (record.translationPrompt || null) : null);
      })
      .catch((e) => console.error('[PopupDeepseekCard] Failed to load novel:', e));
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

  return <AiConfigPanel ref={ref} variant="compact" ids={PANEL_IDS} hooks={hooks} prompt={prompt} />;
});

export default PopupDeepseekCard;
