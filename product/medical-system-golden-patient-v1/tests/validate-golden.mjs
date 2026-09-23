import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

const ep = readJson("data/golden-episode.json");
const settlement = readJson("billing/settlement-list.json");
const drg = readJson("grouping/expected-drg-3.0.json");
const dip = readJson("grouping/expected-dip-3.0.json");

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

assert(ep.synthetic === true, "Golden patient must be synthetic");
assert(ep.episodeId === "EP-DEMO-001", "episodeId mismatch");
assert(ep.patient.age === 43 && ep.patient.birthDate === "1983-02-18", "patient age/birth date mismatch");
assert(new Date(ep.discharge.at) > new Date(ep.admission.at), "discharge must be after admission");
assert(ep.diagnoses.principal.code === "K80.000x002", "principal diagnosis mismatch");
assert(ep.procedures[0].code === "51.2300", "primary procedure mismatch");
assert(ep.diagnoses.secondary.length === 0, "base Golden case must have no secondary diagnosis");

const feeTotal = ep.fees.items.reduce((s, x) => s + Number(x.amount || 0), 0);
assert(feeTotal === 13400, `fee total should be 13400, got ${feeTotal}`);
for (const x of ep.fees.items) {
  const split = Number(x.classA||0)+Number(x.classB||0)+Number(x.selfPay||0)+Number(x.other||0);
  assert(split === Number(x.amount||0), `fee split mismatch: ${x.name}`);
}
assert(Number(ep.payment.fund)+Number(ep.payment.individualBurden) === feeTotal, "payment total mismatch");
assert(settlement.fees.totals.amount === feeTotal, "settlement total mismatch");
assert(settlement.inpatient.lengthOfStay === 5, "length of stay mismatch");

const finalDrg = drg.expectedPath.at(-1);
assert(finalDrg.code === "HC45", "expected DRG should be HC45");
assert(dip.expectedResult.status === "EXCLUDED_PRINCIPAL_DIAGNOSIS" && dip.expectedResult.exclusion.code === "K80.000", "DIP exclusion expectation mismatch");

console.log("PASS Golden patient base dataset");
console.log(`  Episode: ${ep.episodeId}`);
console.log(`  Diagnosis: ${ep.diagnoses.principal.code}`);
console.log(`  Procedure: ${ep.procedures[0].code}`);
console.log(`  Fee total: ${feeTotal}`);
console.log(`  DRG expected: ${finalDrg.code}`);
console.log(`  DIP expected outcome: ${dip.expectedResult.status} (${dip.expectedResult.exclusion.code})`);
