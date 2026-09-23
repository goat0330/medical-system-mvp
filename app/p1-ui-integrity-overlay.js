import { getDrg3DiagnosisSupport } from './p1/drg-input-validator.js';

let applying = false;
function paymentMethod() {
  const text = document.querySelector('[name="policyProfileId"]')?.selectedOptions?.[0]?.textContent || '';
  return /DIP/i.test(text) ? 'DIP' : 'DRG';
}
function fixStatusBadges(root = document) {
  root.querySelectorAll('.status-badge').forEach((badge) => {
    const text = String(badge.textContent || '').trim().toUpperCase();
    if (!/(NOT_GROUPED|INVALID|UNSUPPORTED|BLOCKED|FAIL|ERROR|REJECTED)/.test(text)) return;
    badge.classList.remove('status-badge--green','status-badge--blue','status-badge--amber','status-badge--gray');
    badge.classList.add('status-badge--red');
  });
}
function fixSyntheticLabel(root = document) {
  const episode = window.medicalSystemMvp?.getEpisodeContext?.()?.episode;
  if (!episode || episode.goldenData || episode.datasetId || episode.datasetVersion) return;
  root.querySelectorAll('.status-badge').forEach((badge) => {
    if ((badge.textContent || '').trim() === 'Golden 合成测试 Episode') badge.textContent = episode.synthetic ? '合成测试 Episode' : '当前 Episode';
  });
}
function filterDiagnosisPicker(root = document) {
  const dialog = root.querySelector?.('#op-diagnosis-dialog') || document.querySelector('#op-diagnosis-dialog'); if (!dialog) return;
  const isDrg = paymentMethod() === 'DRG';
  let visible = 0; let total = 0;
  dialog.querySelectorAll('[data-diagnosis-code]').forEach((button) => {
    total += 1;
    const support = getDrg3DiagnosisSupport(button.dataset.diagnosisCode);
    const hide = isDrg && !support.supported;
    button.hidden = hide;
    if (!hide) { visible += 1; button.dataset.drgSupport = support.status; }
  });
  const count = dialog.querySelector('#op-diagnosis-count');
  if (count && isDrg) {
    const text = `当前列表 ${visible} 条可用于 DRG 3.0 · 已过滤 ${Math.max(0,total-visible)} 条仅 DIP/非DRG规则编码`;
    if (count.textContent !== text) count.textContent = text;
  }
  let empty = dialog.querySelector('[data-drg-filter-empty]');
  if (isDrg && total > 0 && visible === 0) {
    if (!empty) { empty = document.createElement('div'); empty.className='empty-state'; empty.dataset.drgFilterEmpty='1'; empty.textContent='当前搜索结果只存在于 DIP/通用诊断目录中，未被当前 DRG 3.0 官方规则精确收录；请更换编码或由编码员确认标准编码。'; dialog.querySelector('#op-diagnosis-results')?.appendChild(empty); }
  } else empty?.remove();
  const foot = dialog.querySelector('.op-diagnosis-dialog__foot span');
  const footText = isDrg ? 'DRG 路径只显示当前官方 DRG 3.0 规则可识别的诊断编码；手工输入仍会在执行前再次校验。' : 'DIP 路径使用官方 DIP 3.0 诊断目录。';
  if (foot && foot.textContent !== footText) foot.textContent = footText;
}
function showResetNotice(root = document) {
  const state = window.__medicalSystemIntegrityState; if (!state?.workspace?.reset) return;
  const source = root.querySelector?.('.op-source') || document.querySelector('.op-source');
  if (!source || source.querySelector('[data-source-reset-notice]')) return;
  const reason = state.workspace.reason === 'MIGRATED_LEGACY_WORKSPACE' ? '检测到旧版工作台草稿，没有来源指纹，已安全归档并从当前患者重新映射。' : '患者/病历源数据发生变化，旧工作台草稿已归档，避免继续使用过期输入。';
  source.insertAdjacentHTML('beforeend', `<div class="notice op-warning" data-source-reset-notice>${reason}</div>`);
}
function apply() {
  if (applying) return; applying = true;
  try { fixStatusBadges(); fixSyntheticLabel(); filterDiagnosisPicker(); showResetNotice(); }
  finally { applying = false; }
}
const observer = new MutationObserver(() => queueMicrotask(apply)); observer.observe(document.querySelector('#app'), { childList:true, subtree:true });
document.addEventListener('change', (event) => { if (event.target?.matches?.('[name="policyProfileId"]')) queueMicrotask(apply); });
window.addEventListener('medical-system:source-integrity', () => queueMicrotask(apply));
window.addEventListener('load', apply); setTimeout(apply,0);
