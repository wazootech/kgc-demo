import assert from "node:assert/strict";
import { test } from "node:test";
import { runScenario } from "../src/scenario.ts";

test("seed World loads 28 quads", async () => {
  const result = await runScenario();
  assert.deepStrictEqual(result.importedQuads, 28);
});

test("answer A1 traces to its source facts", async () => {
  const result = await runScenario();
  const answer = result.answersBefore.find((entry) => entry.id === "A1");
  assert.ok(answer !== undefined);
  assert.deepStrictEqual(answer.answer, "Yes, verified compatible at 144 Hz.");
  assert.deepStrictEqual(
    answer.claim,
    "https://demo.wazoo.dev/kgc2027#ClaimC1",
  );
  assert.deepStrictEqual(
    answer.source,
    "https://demo.wazoo.dev/kgc2027/sources/lab-test-2026-10-14",
  );
  assert.deepStrictEqual(answer.validUntil, "2027-01-31");
  assert.deepStrictEqual(answer.testReference, "LAB-2026-10-14-07");
});

test("seed claims pass all validation checks", async () => {
  const result = await runScenario();
  // One ASK per rule (V1–V4), each covering all claims in the World.
  assert.deepStrictEqual(result.validationSeed.length, 4);
  assert.ok(result.validationSeed.every((check) => check.outcome === "pass"));
});

test("candidate C2 is rejected and never imported", async () => {
  const result = await runScenario();
  assert.deepStrictEqual(result.candidateRejected, true);
  const violations = result.validationCandidate
    .filter((check) => check.outcome === "violation")
    .map((check) => check.id);
  assert.deepStrictEqual(violations, ["V1", "V2"]);
  // The World still holds only the seed quads minus the retraction.
  assert.deepStrictEqual(result.quadsAfterRetraction, 21);
});

test("retraction removes C1 and changes only A1", async () => {
  const result = await runScenario();
  assert.deepStrictEqual(result.retraction.quadsDeleted, 7);
  assert.deepStrictEqual(result.retraction.answersAffected, ["A1"]);
  const afterA1 = result.answersAfter.find((entry) => entry.id === "A1");
  const afterA2 = result.answersAfter.find((entry) => entry.id === "A2");
  assert.deepStrictEqual(
    afterA1?.answer,
    "No verified compatibility on record.",
  );
  assert.deepStrictEqual(afterA1?.claim, null);
  assert.deepStrictEqual(afterA2?.answer, "Yes, verified compatible.");
  assert.deepStrictEqual(
    afterA2?.claim,
    "https://demo.wazoo.dev/kgc2027#ClaimC3",
  );
});
