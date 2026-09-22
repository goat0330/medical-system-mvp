import assert from "node:assert/strict";
import * as Hm from "../app/domain/hmeditor.js";
import * as Templates from "../app/data/templates.js";
import { createEpisodeFixture } from "../app/data/episode.js";
import * as Settlement from "../app/domain/settlement.js";

const episode = createEpisodeFixture();
const templates = Array.isArray(Templates.HMEDITOR_TEMPLATES)
  ? Templates.HMEDITOR_TEMPLATES
  : Object.values(Templates.HMEDITOR_TEMPLATES || {});
const enabled = templates.filter((item) => item.enabled !== false);
for (const excluded of ["会诊", "接班", "阶段小结", "一般护理记录单", "死亡记录", "死亡病例讨论"]) {
  assert.equal(enabled.some((item) => JSON.stringify(item).includes(excluded)), false, "excluded template: " + excluded);
}

const home = enabled.find((item) => JSON.stringify(item).includes("病案首页"));
assert.ok(home, "HmEditor front page template is registered");
assert.equal(home.source, "HmEditor");

const settlement = Settlement.buildSettlementList(episode);
const issues = Settlement.validateSettlementList(settlement);
assert.ok(Array.isArray(issues), "settlement validation returns an array");

const snapshot = Settlement.createClaimSnapshot(settlement, { idempotencyKey: "INTEGRATION-001" });
assert.equal(snapshot.rule_context.region, "CN-NATIONAL");
assert.equal(snapshot.interface_context.transaction_code, "3600");
const first = Settlement.submitSettlementMock(snapshot);
const second = Settlement.submitSettlementMock(snapshot);
assert.equal(second.batch_id, first.batch_id, "mock submission reuses the same batch");
assert.equal(second.duplicate, true, "mock submission marks replay");
assert.equal(second.effect.duplicate_deduction_prevented, true, "mock submission prevents duplicate deduction");
const reconciliation = Settlement.reconcileSettlement(snapshot, first);
assert.equal(typeof reconciliation.balanced, "boolean");

console.log("integration smoke passed", {
  templates: enabled.length,
  settlementIssues: issues.length,
  balanced: reconciliation.balanced
});
