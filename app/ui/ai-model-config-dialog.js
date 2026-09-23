import { AI_PROVIDER_PRESETS, listAiModels, saveAiModel, testAiModel } from '../services/ai/model-config.js';
import { escapeHtml } from './primitives.js';
import { icon } from '../design/icons.js';

const defaultDraft = (preset = AI_PROVIDER_PRESETS[0], existing = null) => ({
  id: existing?.id || crypto.randomUUID(),
  name: preset.name,
  provider: preset.provider,
  protocol: preset.protocol,
  baseUrl: preset.baseUrl,
  modelId: preset.modelId,
  apiKeyConfigured: Boolean(existing?.apiKeyConfigured),
  apiKey: '',
  enabled: existing?.enabled ?? true,
  isDefault: existing?.isDefault ?? false,
  connected: Boolean(existing?.connected),
});

function presetFor(provider) {
  return AI_PROVIDER_PRESETS.find((item) => item.provider === provider) || AI_PROVIDER_PRESETS[0];
}

function statusText(model) {
  if (!model.enabled) return '未启用';
  if (model.connected) return '已连接';
  return model.apiKeyConfigured || model.protocol === 'ollama' ? '待测试' : '待配置';
}

function dialogMarkup(models, selected, draft, testState, error) {
  const savedRows = models.map((model) => `<button type="button" class="ai-model-list-item ${selected === model.id ? 'is-selected' : ''}" data-ai-model-select="${escapeHtml(model.id)}">
    <span class="ai-provider-mark">${icon('ai')}</span><span class="ai-model-list-copy"><strong>${escapeHtml(model.name)}</strong><small>${escapeHtml(model.modelId)}</small></span><span class="ai-model-list-status">${escapeHtml(statusText(model))}</span>
  </button>`).join('');
  const presets = AI_PROVIDER_PRESETS.slice(0, 3).map((preset) => `<button type="button" class="ai-model-list-item ai-model-list-item--preset" data-ai-provider-preset="${escapeHtml(preset.provider)}">
    <span class="ai-provider-mark">${icon('ai')}</span><span class="ai-model-list-copy"><strong>${escapeHtml(preset.name)}</strong><small>${escapeHtml(preset.modelId)}</small></span><span class="ai-model-list-status">示例</span>
  </button>`).join('');
  const providerOptions = AI_PROVIDER_PRESETS.map((preset) => `<option value="${escapeHtml(preset.provider)}" ${draft.provider === preset.provider ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`).join('');
  const modelOptions = presetFor(draft.provider).models.map((model) => `<option value="${escapeHtml(model)}"></option>`).join('');
  const testMessage = testState === 'testing'
    ? '<div class="ai-model-feedback is-pending" role="status">正在测试连接…</div>'
    : testState === 'success'
      ? '<div class="ai-model-feedback is-success" role="status">连接成功，可以保存并用于质控。</div>'
      : error ? `<div class="ai-model-feedback is-error" role="alert">${escapeHtml(error)}</div>` : '';

  return `<div class="ai-model-overlay" data-ai-model-overlay>
    <section class="ai-model-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-model-dialog-title">
      <header class="ai-model-dialog__header"><div><h2 id="ai-model-dialog-title">AI 模型配置</h2><p>配置和管理大模型，用于病历质控、字段映射和 AI 辅助。</p></div><button type="button" class="ai-model-dialog__close" data-ai-dialog-close aria-label="关闭">${icon('close')}</button></header>
      <div class="ai-model-dialog__body">
        <aside class="ai-model-config-list"><h3>模型列表</h3>${savedRows || '<p class="ai-model-empty">暂无已保存模型。选择一个示例配置开始添加。</p>'}${models.length ? '' : `<div class="ai-model-presets">${presets}</div>`}<button type="button" class="app-button ai-model-add" data-ai-model-add>${icon('plus')}<span>添加模型</span></button></aside>
        <form class="ai-model-form" data-ai-model-form>
          <h3>模型配置</h3>
          <label class="ai-model-field"><span>厂商</span><select class="app-select" name="provider">${providerOptions}</select></label>
          <label class="ai-model-field"><span>接口协议</span><select class="app-select" name="protocol"><option value="openai-compatible" ${draft.protocol === 'openai-compatible' ? 'selected' : ''}>OpenAI Compatible</option><option value="azure-openai" ${draft.protocol === 'azure-openai' ? 'selected' : ''}>Azure OpenAI</option><option value="ollama" ${draft.protocol === 'ollama' ? 'selected' : ''}>Ollama / 本地模型</option></select></label>
          <label class="ai-model-field"><span>API Base URL</span><input class="app-input" name="baseUrl" value="${escapeHtml(draft.baseUrl)}" autocomplete="url" required></label>
          <label class="ai-model-field"><span>API Key</span><span class="ai-model-key-wrap"><input class="app-input" name="apiKey" type="password" value="${escapeHtml(draft.apiKey)}" placeholder="${draft.apiKeyConfigured ? 'sk-••••••••••••（已保存，留空则不变）' : draft.protocol === 'ollama' ? '本地模型可留空' : '输入或粘贴 API Key'}" maxlength="2048" autocomplete="new-password" autocapitalize="off" spellcheck="false"><button type="button" data-ai-key-toggle aria-label="显示 API Key">${icon('eye')}</button></span><small>密钥只保存在本地服务进程内存，不会返回浏览器；服务重启后需重新配置。</small></label>
          <label class="ai-model-field"><span>模型</span><input class="app-input" name="modelId" list="ai-model-options" value="${escapeHtml(draft.modelId)}" autocomplete="off" required><datalist id="ai-model-options">${modelOptions}</datalist></label>
          <div class="ai-model-switches"><label><input type="checkbox" name="enabled" ${draft.enabled ? 'checked' : ''}> 启用模型</label><label><input type="checkbox" name="isDefault" ${draft.isDefault ? 'checked' : ''}> 设为默认模型</label></div>
          ${testMessage}
          <div class="ai-model-form__actions"><button type="button" class="app-button" data-ai-model-test ${testState === 'testing' ? 'disabled' : ''}>${icon('link')} 测试连接</button><span class="ai-model-form__spacer"></span><button type="button" class="app-button" data-ai-dialog-close>取消</button><button type="submit" class="app-button app-button--primary" ${testState === 'testing' ? 'disabled' : ''}>保存配置</button></div>
        </form>
      </div>
    </section>
  </div>`;
}

export function openAiModelConfigDialog({ models = [], onSaved = () => {} } = {}) {
  document.querySelector('[data-ai-model-overlay]')?.remove();
  let selectedId = models.find((model) => model.isDefault)?.id || models[0]?.id || '';
  let draft = selectedId ? defaultDraft(presetFor(models.find((model) => model.id === selectedId)?.provider), models.find((model) => model.id === selectedId)) : defaultDraft();
  let testState = draft.connected ? 'success' : 'idle';
  let testError = '';
  const host = document.createElement('div');
  const render = () => { host.innerHTML = dialogMarkup(models, selectedId, draft, testState, testError); };
  const close = () => host.remove();
  const formValues = () => {
    const form = host.querySelector('[data-ai-model-form]');
    const data = new FormData(form);
    const preset = presetFor(String(data.get('provider') || 'deepseek'));
    return {
      id: draft.id,
      name: preset.name,
      provider: preset.provider,
      protocol: String(data.get('protocol') || preset.protocol),
      baseUrl: String(data.get('baseUrl') || '').trim(),
      apiKey: String(data.get('apiKey') || '').trim(),
      modelId: String(data.get('modelId') || '').trim(),
      enabled: Boolean(data.get('enabled')),
      isDefault: Boolean(data.get('isDefault')),
    };
  };

  render();
  document.body.append(host);
  host.addEventListener('click', async (event) => {
    if (event.target === host.querySelector('[data-ai-model-overlay]') || event.target.closest('[data-ai-dialog-close]')) { close(); return; }
    const select = event.target.closest('[data-ai-model-select]');
    if (select) {
      selectedId = select.dataset.aiModelSelect;
      const model = models.find((item) => item.id === selectedId);
      draft = defaultDraft(presetFor(model.provider), model);
      testState = model.connected ? 'success' : 'idle';
      testError = '';
      render();
      return;
    }
    const presetButton = event.target.closest('[data-ai-provider-preset]');
    if (presetButton) {
      const preset = presetFor(presetButton.dataset.aiProviderPreset);
      selectedId = '';
      draft = defaultDraft(preset);
      testState = 'idle';
      testError = '';
      render();
      return;
    }
    if (event.target.closest('[data-ai-model-add]')) {
      selectedId = '';
      draft = defaultDraft();
      testState = 'idle';
      testError = '';
      render();
      host.querySelector('[name="provider"]')?.focus();
      return;
    }
    if (event.target.closest('[data-ai-key-toggle]')) {
      const input = host.querySelector('[name="apiKey"]');
      input.type = input.type === 'password' ? 'text' : 'password';
      return;
    }
    if (event.target.closest('[data-ai-model-test]')) {
      const config = formValues();
      if (!config.baseUrl || !config.modelId || (config.protocol !== 'ollama' && !config.apiKey && !draft.apiKeyConfigured)) {
        testState = 'error';
        testError = config.protocol === 'ollama' ? '请填写 Base URL 和模型 ID。' : '请填写 API Key、Base URL 和模型 ID。';
        render();
        return;
      }
      draft = { ...draft, ...config, apiKeyConfigured: draft.apiKeyConfigured || Boolean(config.apiKey) };
      testState = 'testing';
      testError = '';
      render();
      try {
        await testAiModel(config);
        testState = 'success';
      } catch (error) {
        testState = 'error';
        testError = error instanceof Error ? error.message : '连接测试失败，请检查配置后重试。';
      }
      render();
    }
  });
  host.addEventListener('change', (event) => {
    if (event.target.name === 'provider') {
      const preset = presetFor(event.target.value);
      const wasDefault = host.querySelector('[name="isDefault"]')?.checked || false;
      draft = { ...defaultDraft(preset), id: draft.id, isDefault: wasDefault };
      testState = 'idle';
      testError = '';
      render();
    } else if (event.target.name !== 'apiKey') {
      testState = 'idle';
      testError = '';
      host.querySelector('.ai-model-feedback')?.remove();
    }
  });
  host.addEventListener('input', (event) => {
    if (event.target.name === 'apiKey') draft.apiKey = event.target.value;
    if (event.target.name) {
      testState = 'idle';
      testError = '';
      host.querySelector('.ai-model-feedback')?.remove();
    }
  });
  host.addEventListener('submit', async (event) => {
    if (!event.target.matches('[data-ai-model-form]')) return;
    event.preventDefault();
    const config = formValues();
    if (config.isDefault) config.enabled = true;
    const saveButton = host.querySelector('[type="submit"]');
    saveButton.disabled = true;
    saveButton.textContent = '保存中…';
    try {
      models = await saveAiModel(config);
      await onSaved(models, config.id);
      close();
    } catch (error) {
      testState = 'error';
      testError = error instanceof Error ? error.message : '保存失败，请重试。';
      render();
    }
  });
  host.querySelector('[data-ai-key-toggle]')?.setAttribute('aria-label', '显示 API Key');
}
