/**
 * eval/run.ts re-runs the demo scenario and writes eval/results.md with
 * the measured numbers. Nothing here is hand-written: every number comes
 * from the run itself.
 * Usage: deno task eval
 */
import { runScenario } from "../src/scenario.ts";
import { writeRecords } from "../src/records.ts";

const RESULTS_URL = new URL("./results.md", import.meta.url);

function countOutcomes(
  results: { outcome: string }[],
  outcome: string,
): number {
  return results.filter((result) => result.outcome === outcome).length;
}

if (import.meta.main) {
  const result = await runScenario();
  await writeRecords(result);

  const seedPass = countOutcomes(result.validationSeed, "pass");
  const seedViolations = countOutcomes(result.validationSeed, "violation");
  const candidateViolations = countOutcomes(
    result.validationCandidate,
    "violation",
  );
  const candidatePass = countOutcomes(result.validationCandidate, "pass");
  const candidateNotApplicable = countOutcomes(
    result.validationCandidate,
    "not-applicable",
  );
  const answersChanged = result.answersBefore.filter((before, index) =>
    before.answer !== result.answersAfter[index]?.answer
  ).length;

  const results = `# Evaluation results

Measured by running \`deno task eval\` on this machine. Every number
below comes from that run; none is hand-written. Re-run it to reproduce
these numbers (the retraction timestamp and elapsed time will differ).

- Run at: ${new Date().toISOString()}
- Scenario wall time: ${result.elapsedMs} ms (single run on this machine;
  not a benchmark — no warmup, no repetition, no comparison)
- SPARQL queries run: ${result.queriesRun}

## Trace

- Quads imported from \`world/seed.ttl\`: ${result.importedQuads}
- Answers before retraction: ${result.answersBefore.length}
- Answers traced to a source, validUntil date, and test reference: ${
    result.answersBefore.filter((answer) =>
      answer.source !== null
    ).length
  } of ${result.answersBefore.length}
- Answers with no source: ${
    result.answersBefore.filter((answer) => answer.source === null).length
  }

## Validate

- Seed claims checked: ${result.validationSeed.length} checks (one ASK per rule V1–V4, each covering all claims C1 and C3)
- Seed checks passed: ${seedPass}
- Seed checks violated: ${seedViolations}
- Candidate claim C2 (forum post, no validUntil): ${result.validationCandidate.length} checks,
  ${candidateViolations} violations (V1 untrusted source, V2 missing validUntil),
  ${candidatePass} passed, ${candidateNotApplicable} not applicable (V3 expiry,
  no date to compare)
- Candidate C2 imported into the World: ${
    result.candidateRejected ? "no — rejected" : "yes (unexpected)"
  }

## Retract

- Quads deleted by DELETE DATA: ${result.retraction.quadsDeleted}
- Quads remaining after retraction: ${result.quadsAfterRetraction}
- Claim C1 still present after DELETE DATA: no (verified with ASK)
- Answers before retraction that used claim C1: ${result.retraction.answersAffected.length} (${
    result.retraction.answersAffected.join(", ") || "none"
  })
- Answers whose text changed on re-ask: ${answersChanged} of ${result.answersAfter.length}
  (A1 changed to "No verified compatibility on record."; A2 unchanged)
- Retraction record: \`world/retractions.jsonl\`
- Answer log: \`eval/answers.jsonl\`

## What retraction does not yet guarantee

- A deleted fact is gone from the World. It is not recoverable from the
  World, and there is no tombstone in the World itself. The retraction
  record and the answer log are files written by this demo, outside the
  World — not Worlds features.
- The answer log only covers answers this demo gave. An answer given by
  another agent, or in another session, is not in this log and would not
  be found by it.
- Validation is SPARQL ASK checks (src/validate.ts), not a SHACL engine.
  No SHACL engine ships in @worlds/sdk 0.9.0, @wazoo/sparql-engine 0.4.4,
  or @wazoo/reasoner 0.4.0. See "What it does not do yet" in README.md.
`;

  await Deno.writeTextFile(RESULTS_URL, results);
  console.log(results);
  console.log(
    "Wrote eval/results.md, eval/answers.jsonl, world/retractions.jsonl",
  );
}
