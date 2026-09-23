export function buildDownloadOptions(config, { includeTopLevelCooldown = false } = {}) {
  const {
    enabled = false,
    provider = 'official',
    customUrl = '',
    apiKey = '',
    model = 'deepseek-flash',
    prompt = '',
    cooldown
  } = config || {};

  const custom = provider !== 'official';
  let key = (apiKey || '').trim();

  if (enabled && !key && !custom) return null;
  if (enabled && !key && custom) key = 'sk-local';

  const cooldownEnabled = cooldown ? cooldown.enabled !== false : true;
  const options = {
    translation: {
      enabled,
      cooldown: cooldownEnabled,
      apiKey: key || (custom ? 'sk-local' : ''),
      prompt,
      model,
      provider,
      baseUrl: custom ? customUrl : undefined
    }
  };
  if (includeTopLevelCooldown) options.cooldown = cooldownEnabled;
  return options;
}

export default buildDownloadOptions;
