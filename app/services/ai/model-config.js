export const AI_PROVIDER_PRESETS = Object.freeze([
  { provider: 'deepseek', name: 'DeepSeek', protocol: 'openai-compatible', baseUrl: 'https://api.deepseek.com', modelId: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { provider: 'qwen', name: '通义千问', protocol: 'openai-compatible', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', modelId: 'qwen-plus', models: ['qwen-plus', 'qwen-max', 'qwen-turbo'] },
  { provider: 'ollama', name: '本地模型', protocol: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', modelId: 'qwen3:32b', models: ['qwen3:32b', 'qwen3:8b'] },
  { provider: 'openai', name: 'OpenAI', protocol: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', modelId: 'gpt-4o-mini', models: ['gpt-4o-mini', 'gpt-4.1-mini'] },
  { provider: 'azure-openai', name: 'Azure OpenAI', protocol: 'azure-openai', baseUrl: 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT/chat/completions?api-version=2024-10-21', modelId: 'YOUR_DEPLOYMENT', models: [] },
  { provider: 'zhipu', name: '智谱', protocol: 'openai-compatible', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', modelId: 'glm-4-flash', models: ['glm-4-flash', 'glm-4-plus'] },
  { provider: 'moonshot', name: 'Moonshot', protocol: 'openai-compatible', baseUrl: 'https://api.moonshot.cn/v1', modelId: 'moonshot-v1-8k', models: ['moonshot-v1-8k', 'moonshot-v1-32k'] },
  { provider: 'openai-compatible', name: 'OpenAI Compatible', protocol: 'openai-compatible', baseUrl: 'https://your-endpoint/v1', modelId: 'your-model', models: [] },
]);

async function requestJson(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `本地服务请求失败（HTTP ${response.status}）。`);
  return payload;
}

export async function listAiModels() {
  const result = await requestJson('/api/ai/models');
  return Array.isArray(result.models) ? result.models : [];
}

export async function saveAiModel(config) {
  const result = await requestJson('/api/ai/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return result.models;
}

export async function testAiModel(config) {
  return requestJson('/api/ai/models/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}
