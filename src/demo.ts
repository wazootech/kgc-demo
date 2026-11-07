/**
 * demo.ts runs the KGC 2027 demo and prints a human-readable report.
 * Usage: deno task demo
 */
import { runScenario } from "./scenario.ts";
import { writeRecords } from "./records.ts";

function checkLine(
  result: { id: string; name: string; outcome: string },
): string {
  const mark = result.outcome === "pass"
    ? "PASS"
    : result.outcome === "violation"
    ? "VIOLATION"
    : "N/A";
  return `  ${result.id} ${result.name}: ${mark}`;
}

if (import.meta.main) {
  const result = await runScenario();
  await writeRecords(result);

  console.log("KGC 2027 demo — Verifiable Memory for Agents That Act");
  console.log(
    `World loaded: ${result.importedQuads} quads from world/seed.ttl`,
  );
  console.log(`SPARQL queries run: ${result.queriesRun}`);
  console.log("");
  console.log("1. ASK + TRACE");
  for (const answer of result.answersBefore) {
    console.log(`  ${answer.id}: ${answer.question}`);
    console.log(`  -> ${answer.answer}`);
    console.log(`     claim: ${answer.claim}`);
    console.log(`     source: ${answer.source}`);
    console.log(`     valid until: ${answer.validUntil}`);
    console.log(`     test: ${answer.testReference}`);
  }
  console.log("");
  console.log("2. VALIDATE — seed claims");
  for (const check of result.validationSeed) console.log(checkLine(check));
  console.log("   Candidate claim C2 (forum post, no validUntil):");
  for (const check of result.validationCandidate) console.log(checkLine(check));
  console.log(
    `   Candidate C2 ${
      result.candidateRejected
        ? "REJECTED — never imported."
        : "accepted (unexpected)"
    }`,
  );
  console.log("");
  console.log("3. RETRACT — claim C1");
  console.log(`   quads deleted: ${result.retraction.quadsDeleted}`);
  console.log(`   reason: ${result.retraction.reason}`);
  console.log(`   quads remaining: ${result.quadsAfterRetraction}`);
  console.log(
    `   earlier answers affected: ${
      result.retraction.answersAffected.join(", ")
    }`,
  );
  console.log("");
  console.log("4. RE-ASK");
  for (const answer of result.answersAfter) {
    console.log(`  ${answer.id}: ${answer.question}`);
    console.log(`  -> ${answer.answer}`);
  }
  console.log("");
  console.log(
    `Done in ${result.elapsedMs} ms. Logs: eval/answers.jsonl, world/retractions.jsonl`,
  );
}
