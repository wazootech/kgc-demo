# Evaluation results

Measured by running `deno task eval` on this machine. Every number
below comes from that run; none is hand-written. Re-run it to reproduce
these numbers (the retraction timestamp and elapsed time will differ).

- Run at: 2026-11-07T08:00:23.531Z
- Scenario wall time: 80 ms (single run on this machine;
  not a benchmark — no warmup, no repetition, no comparison)
- SPARQL queries run: 15

## Trace

- Quads imported from `world/seed.ttl`: 28
- Answers before retraction: 2
- Answers traced to a source, validUntil date, and test reference: 2 of 2
- Answers with no source: 0

## Validate

- Seed claims checked: 4 checks (one ASK per rule V1–V4, each covering all claims C1 and C3)
- Seed checks passed: 4
- Seed checks violated: 0
- Candidate claim C2 (forum post, no validUntil): 4 checks,
  2 violations (V1 untrusted source, V2 missing validUntil),
  1 passed, 1 not applicable (V3 expiry,
  no date to compare)
- Candidate C2 imported into the World: no — rejected

## Retract

- Quads deleted by DELETE DATA: 7
- Quads remaining after retraction: 21
- Claim C1 still present after DELETE DATA: no (verified with ASK)
- Answers before retraction that used claim C1: 1 (A1)
- Answers whose text changed on re-ask: 1 of 2
  (A1 changed to "No verified compatibility on record."; A2 unchanged)
- Retraction record: `world/retractions.jsonl`
- Answer log: `eval/answers.jsonl`

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
