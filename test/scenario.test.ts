import { assert, assertEquals } from "@std/assert";
import { runScenario } from "../src/scenario.ts";

Deno.test("seed World loads 28 quads", async () => {
  const result = await runScenario();
  assertEquals(result.importedQuads, 28);
});

Deno.test("answer A1 traces to its source facts", async () => {
  const result = await runScenario();
  const answer = result.answersBefore.find((entry) => entry.id === "A1");
  assert(answer !== undefined);
  assertEquals(answer.answer, "Yes, verified compatible at 144 Hz.");
  assertEquals(answer.claim, "https://demo.wazoo.dev/kgc2027#ClaimC1");
  assertEquals(
    answer.source,
    "https://demo.wazoo.dev/kgc2027/sources/lab-test-2026-10-14",
  );
  assertEquals(answer.validUntil, "2027-01-31");
  assertEquals(answer.testReference, "LAB-2026-10-14-07");
});

Deno.test("seed claims pass all validation checks", async () => {
  const result = await runScenario();
  // One ASK per rule (V1–V4), each covering all claims in the World.
  assertEquals(result.validationSeed.length, 4);
  assert(result.validationSeed.every((check) => check.outcome === "pass"));
});

Deno.test("candidate C2 is rejected and never imported", async () => {
  const result = await runScenario();
  assertEquals(result.candidateRejected, true);
  const violations = result.validationCandidate
    .filter((check) => check.outcome === "violation")
    .map((check) => check.id);
  assertEquals(violations, ["V1", "V2"]);
  // The World still holds only the seed quads minus the retraction.
  assertEquals(result.quadsAfterRetraction, 21);
});

Deno.test("retraction removes C1 and changes only A1", async () => {
  const result = await runScenario();
  assertEquals(result.retraction.quadsDeleted, 7);
  assertEquals(result.retraction.answersAffected, ["A1"]);
  const afterA1 = result.answersAfter.find((entry) => entry.id === "A1");
  const afterA2 = result.answersAfter.find((entry) => entry.id === "A2");
  assertEquals(afterA1?.answer, "No verified compatibility on record.");
  assertEquals(afterA1?.claim, null);
  assertEquals(afterA2?.answer, "Yes, verified compatible.");
  assertEquals(afterA2?.claim, "https://demo.wazoo.dev/kgc2027#ClaimC3");
});
