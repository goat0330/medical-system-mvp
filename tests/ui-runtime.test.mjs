import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../app/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');
const medicalCss = readFileSync(new URL('../app/design/medical.css', import.meta.url), 'utf8');
const editorCss = readFileSync(new URL('../app/design/record-editor.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

for (const phrase of ['病历编辑质控','医保结算清单','DRG / DIP 3.0','智能医保审核']) assert.match(main, new RegExp(phrase));
for (const component of ['workbench-detail','record-navigation','patient-history','medical-record-editor-host','record-qc-floating','patient-selector-card','patient-option']) assert.ok(main.includes(component) || editorCss.includes(component) || medicalCss.includes(component), `missing ${component}`);
assert.match(css, /design\/record-editor\.css/);
assert.match(index, /住院医疗智能系统/);
assert.doesNotMatch(main, /editor\.huimei\.com|raw\.githubusercontent\.com|HmEditor|惠每/i);
assert.match(main, /function selectPatient\(key\)/);
assert.match(main, /state\.editorSession\?\.destroy\?\./);

class FakeElement {
  constructor(dataset) { this.dataset = dataset; this.listeners = new Map(); }
  addEventListener(type, cb) { this.listeners.set(type, cb); }
  click() { this.listeners.get('click')?.({ currentTarget: this, target: this }); }
}

const cache = new Map();
const app = {
  _html: '',
  version: 0,
  set innerHTML(value) { this._html = String(value); this.version += 1; cache.clear(); },
  get innerHTML() { return this._html; },
};
const toCamel = (value) => value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
const document = {
  documentElement: { style: {}, dataset: {} },
  querySelector(selector) { return selector === '#app' ? app : null; },
  querySelectorAll(selector) {
    const wanted = selector.match(/^\[data-([a-z0-9-]+)\]$/i)?.[1];
    if (!wanted) return [];
    const cacheKey = `${app.version}:${selector}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const nodes = [];
    const tagRegex = /<([a-zA-Z0-9-]+)\b([^>]*)>/g;
    const attributeRegex = /data-([a-zA-Z0-9-]+)="([^"]*)"/g;
    let tag;
    while ((tag = tagRegex.exec(app.innerHTML))) {
      const dataset = {};
      let attribute;
      while ((attribute = attributeRegex.exec(tag[2]))) dataset[toCamel(attribute[1])] = attribute[2];
      if (Object.hasOwn(dataset, toCamel(wanted))) nodes.push(new FakeElement(dataset));
    }
    cache.set(cacheKey, nodes);
    return nodes;
  },
};

globalThis.document = document;
globalThis.location = { search: '?view=documents&template=admission' };
globalThis.window = { innerWidth: 1920, innerHeight: 1080, addEventListener() {} };
await import(`../app/main.js?ui-runtime=${Date.now()}`);

assert.equal(document.documentElement.style.fontSize, '10px');
assert.match(app.innerHTML, /patient-selector-card/);
assert.match(app.innerHTML, /虚构患者甲/);
assert.match(app.innerHTML, /EP-DEMO-001/);

function clickData(selector, key, value) {
  const node = document.querySelectorAll(selector).find((item) => item.dataset[key] === value);
  assert.ok(node, `missing ${selector} ${key}=${value}`);
  node.click();
}

clickData('[data-action]', 'action', 'toggle-patient-selector');
assert.match(app.innerHTML, /我的住院患者/);
assert.equal(document.querySelectorAll('[data-patient-key]').length, 6);
clickData('[data-patient-key]', 'patientKey', 'p-03');
assert.match(app.innerHTML, /李某某/);
assert.match(app.innerHTML, /EP-DEMO-003/);
assert.match(app.innerHTML, /record-editor-loading/);

clickData('[data-view]', 'view', 'settlement');
assert.match(app.innerHTML, /JSQD-DEMO-003/);
clickData('[data-view]', 'view', 'documents');
assert.match(app.innerHTML, /李某某/);

console.log('PASS UI runtime and patient selector');
