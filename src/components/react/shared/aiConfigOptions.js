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

  const rawModel = typeof model === 'string' ? model.trim() : '';
  const staleModel = !custom && (!rawModel || rawModel.toLowerCase() === 'auto');
  const resolvedModel = staleModel ? 'deepseek-flash' : (custom ? model : rawModel);

  if (enabled && !key && !custom) return null;
  if (enabled && !key && custom) key = 'sk-local';

  const cooldownEnabled = cooldown ? cooldown.enabled !== false : true;
  const options = {
    translation: {
      enabled,
      cooldown: cooldownEnabled,
      apiKey: key || (custom ? 'sk-local' : ''),
      prompt,
      model: resolvedModel,
      provider,
      baseUrl: custom ? customUrl : undefined
    }
  };
  if (includeTopLevelCooldown) options.cooldown = cooldownEnabled;
  return options;
}

export default buildDownloadOptions;
