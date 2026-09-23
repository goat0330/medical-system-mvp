import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const requiredFiles = [
  'AGENTS.md','design/DESIGN.md','design/LAYOUTS.md','design/COMPONENTS.md','design/DOMAIN_COMPONENTS.md','design/STATES.md','design/ICONS.md','design/COMPONENT_MAPPING.md',
  'app/design/tokens.css','app/design/rem.js','app/design/icons.js','app/ui/primitives.js','app/ui/domain-components.js','app/main.js','app/styles.css',
];
for (const file of requiredFiles) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), true, `missing ${file}`);

const tokens = read('app/design/tokens.css');
assert.match(tokens, /--app-color-primary:\s*#2f63f5/);
assert.match(tokens, /--app-sidebar-width:\s*24rem/);
assert.match(tokens, /--app-header-height:\s*9\.6rem/);
assert.match(tokens, /--app-workbench-left:\s*32rem/);
assert.match(tokens, /--app-workbench-right:\s*36rem/);

const rem = read('app/design/rem.js');
assert.match(rem, /DESIGN_WIDTH = 1920/);
assert.match(rem, /DESIGN_HEIGHT = 1080/);
assert.match(rem, /BASE_FONT_SIZE = 10/);

const main = read('app/main.js');
for (const component of ['workbench-detail','record-navigation','medical-document','clinical-data-table','grouping-path','risk-issue-card','evidence-panel']) assert.ok(main.includes(component) || read('app/design/medical.css').includes(component), `missing component ${component}`);
assert.equal(/[▦▤▥◇]/.test(main), false, 'Unicode navigation icons are prohibited');

const allCss = [read('app/styles.css'),read('app/design/layouts.css'),read('app/design/components.css'),read('app/design/medical.css')].join('\n');
assert.match(allCss, /business-nav__link/);
assert.match(allCss, /grid-template-columns:\s*var\(--app-workbench-left\)/);

console.log('PASS design contract');
