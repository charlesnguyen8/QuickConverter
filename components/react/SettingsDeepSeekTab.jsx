import React, { useEffect } from 'react';
import { deepseekTabHtml } from './deepseekTabMarkup.mjs';

export default function SettingsDeepSeekTab() {
  useEffect(() => {
    window.dispatchEvent(new Event('settings-deepseek-mounted'));
  }, []);

  return <div className="contents" dangerouslySetInnerHTML={{ __html: deepseekTabHtml }} />;
}
