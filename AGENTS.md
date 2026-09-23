# UI implementation contract

Before modifying UI, read in order:

1. `design/DESIGN.md`
2. `design/LAYOUTS.md`
3. `design/COMPONENTS.md`
4. `design/DOMAIN_COMPONENTS.md`
5. `design/STATES.md`
6. `design/ICONS.md`
7. `design/COMPONENT_MAPPING.md`

## Mandatory rules

- Gold master: `intelligent-consultation-replica-complete.zip`.
- Design canvas is 1920×1080; root rem scale comes from `app/design/rem.js`.
- Never hard-code a new color outside `app/design/tokens.css`.
- Never introduce a new radius or shadow without updating tokens and DESIGN.md.
- Never use emoji or Unicode characters as icons. Use `app/design/icons.js`.
- New pages MUST reuse AppLayout and PageHeader.
- New cards MUST reuse BaseCard or an approved domain component.
- New tables MUST reuse ClinicalDataTable.
- Status colors MUST use StatusBadge semantics from STATES.md.
- Clinical documents and病案首页 MUST reuse Workbench.
- DRG/DIP paths MUST use GroupingPath; rule explanations MUST use RuleTrace.
- Audit issues MUST use RiskIssueCard; evidence MUST use EvidencePanel.
- Voice remains an integration slot until the speech team supplies the contract implementation.
- Business/domain modules under `app/domain` and `app/data` must not be rewritten merely for styling.
- Do not claim a production DRG/DIP/payment result unless the executable official/local rule package is actually connected.

## Completion gate

Run:

`node tests/design-contract.test.mjs`

and the existing repository tests before delivery.
