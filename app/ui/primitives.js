import { icon } from '../design/icons.js';

export const text = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
};

export const escapeHtml = (value) => text(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '') ?? '';
export const asArray = (value) => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];

export function statusBadge(label, tone = 'gray', compact = false) {
  return `<span class="status-badge status-badge--${tone}${compact ? ' status-badge--compact' : ''}">${escapeHtml(label)}</span>`;
}

export function appButton(label, { action = '', variant = '', size = '', iconName = '', disabled = false, attrs = '' } = {}) {
  const classes = ['app-button', variant ? `app-button--${variant}` : '', size ? `app-button--${size}` : ''].filter(Boolean).join(' ');
  return `<button class="${classes}" ${action ? `data-action="${escapeHtml(action)}"` : ''} ${disabled ? 'disabled' : ''} ${attrs}>${iconName ? icon(iconName) : ''}<span>${escapeHtml(label)}</span></button>`;
}

export function pageHeader(title, desc, actions = '') {
  return `<header class="page-header"><div class="page-header__copy"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(desc)}</p></div><div class="page-header__actions">${actions}</div></header>`;
}

export function metricCard(label, value, note = '') {
  return `<div class="metric-card"><div class="metric-card__label">${escapeHtml(label)}</div><div class="metric-card__value">${escapeHtml(value)}</div><div class="metric-card__note">${escapeHtml(note)}</div></div>`;
}

export function baseCard(title, body, { desc = '', badge = '', className = '' } = {}) {
  return `<section class="base-card ${className}"><div class="base-card__header"><div><h2>${escapeHtml(title)}</h2>${desc ? `<p>${escapeHtml(desc)}</p>` : ''}</div>${badge}</div>${body}</section>`;
}

export function navIcon(name) { return `<span class="business-nav__icon">${icon(name)}</span>`; }
