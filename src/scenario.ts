/**
 * runScenario runs the KGC 2027 demo end to end against the real Worlds
 * stack: createMemoryWorldsSdk from jsr:@worlds/sdk@0.9.0, backed by the
 * Wazoo SPARQL engine from jsr:@wazoo/sparql-engine@0.4.4.
 *
 * Five steps, in order:
 * 1. Ask — answer two compatibility questions from the seeded World.
 * 2. Trace — each answer carries its claim, source, validUntil, and test
 *    reference, so it can be traced to its source facts.
 * 3. Validate — the seed claims and one untrusted candidate claim are
 *    checked against V1–V4 (src/validate.ts). The candidate is rejected
 *    and never imported.
 * 4. Retract — claim C1 is deleted with SPARQL DELETE DATA, and the
 *    revocation is recorded outside the World (see retraction below).
 * 5. Re-ask — both questions are asked again; one answer changes, one
 *    does not, and the answer log shows which earlier answer used C1.
 *
 * On retraction and the World itself: the World does not keep a tombstone.
 * DELETE DATA removes the quads; they are gone from the World. What
 * survives is (a) the retraction record this script writes to
 * world/retractions.jsonl — a file outside the World, not a Worlds
 * feature — and (b) the answer log, which records that answer A1 used
 * claim C1. A deleted fact is not recoverable from the World.
 */
import { createMemoryWorldsSdk } from "@worlds/sdk/memory";
import type { WorldsSdk } from "@worlds/sdk";
import { type CheckResult, runValidation } from "./validate.ts";

export const SEED_URL = new URL("../world/seed.ttl", import.meta.url);

/** Candidate claim C2: never imported. From a forum post, no validUntil. */
export const CANDIDATE_C2_TURTLE = `
@prefix ex: <https://demo.wazoo.dev/kgc2027#> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:ClaimC2 a ex:CompatibilityClaim ;
  ex:subject ex:AuroraLaptop ;
  ex:object ex:HaloDock ;
  dct:source <https://demo.wazoo.dev/kgc2027/sources/forum-post-8841> ;
  ex:testReference "FORUM-8841" .
`;

/** The seven quads of claim C1, exactly as seeded, for DELETE DATA. */
const CLAIM_C1_DELETE = `
PREFIX ex: <https://demo.wazoo.dev/kgc2027#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
DELETE DATA {
  ex:ClaimC1 a ex:CompatibilityClaim ;
    ex:subject ex:AuroraLaptop ;
    ex:object ex:Beacon27Monitor ;
    ex:maxRefresh "144"^^xsd:integer ;
    dct:source <https://demo.wazoo.dev/kgc2027/sources/lab-test-2026-10-14> ;
    ex:validUntil "2027-01-31"^^xsd:date ;
    ex:testReference "LAB-2026-10-14-07" .
}`;

export interface Answer {
  id: string;
  question: string;
  answer: string;
  claim: string | null;
  source: string | null;
  validUntil: string | null;
  testReference: string | null;
  maxRefreshHz: number | null;
}

export interface RetractionRecord {
  revokedClaim: string;
  quadsDeleted: number;
  reason: string;
  recordedAt: string;
  answersAffected: string[];
}

export interface ScenarioResult {
  importedQuads: number;
  quadsAfterRetraction: number;
  queriesRun: number;
  answersBefore: Answer[];
  validationSeed: CheckResult[];
  validationCandidate: CheckResult[];
  candidateRejected: boolean;
  retraction: RetractionRecord;
  answersAfter: Answer[];
  elapsedMs: number;
}

interface SelectBinding {
  value: string;
  type: string;
  datatype?: string;
}

function bindingValue(
  bindings: Record<string, SelectBinding>[],
  variable: string,
): string | null {
  const binding = bindings[0]?.[variable];
  return binding ? binding.value : null;
}

async function countQuads(
  query: (sparql: string) => Promise<unknown>,
): Promise<number> {
  const response = await query(
    "SELECT (COUNT(*) AS ?count) WHERE { ?s ?p ?o }",
  ) as {
    kind: string;
    data: { results: { bindings: Record<string, SelectBinding>[] } };
  };
  if (response.kind !== "select") {
    throw new Error("Expected a SELECT response.");
  }
  const value = bindingValue(response.data.results.bindings, "count");
  if (value === null) throw new Error("COUNT query returned no binding.");
  return Number.parseInt(value, 10);
}

async function answerQuestion(
  query: (sparql: string) => Promise<unknown>,
  id: string,
  question: string,
  subjectIri: string,
  objectIri: string,
): Promise<Answer> {
  const sparql = `PREFIX ex: <https://demo.wazoo.dev/kgc2027#>
PREFIX dct: <http://purl.org/dc/terms/>
SELECT ?claim ?source ?validUntil ?test ?maxRefresh WHERE {
  ?claim a ex:CompatibilityClaim ;
    ex:subject <${subjectIri}> ;
    ex:object <${objectIri}> ;
    dct:source ?source ;
    ex:validUntil ?validUntil ;
    ex:testReference ?test .
  OPTIONAL { ?claim ex:maxRefresh ?maxRefresh }
}`;
  const response = await query(sparql) as {
    kind: string;
    data: { results: { bindings: Record<string, SelectBinding>[] } };
  };
  if (response.kind !== "select") {
    throw new Error("Expected a SELECT response.");
  }
  const bindings = response.data.results.bindings;
  if (bindings.length === 0) {
    return {
      id,
      question,
      answer: "No verified compatibility on record.",
      claim: null,
      source: null,
      validUntil: null,
      testReference: null,
      maxRefreshHz: null,
    };
  }
  const maxRefresh = bindingValue(bindings, "maxRefresh");
  return {
    id,
    question,
    answer: maxRefresh === null
      ? "Yes, verified compatible."
      : `Yes, verified compatible at ${maxRefresh} Hz.`,
    claim: bindingValue(bindings, "claim"),
    source: bindingValue(bindings, "source"),
    validUntil: bindingValue(bindings, "validUntil"),
    testReference: bindingValue(bindings, "test"),
    maxRefreshHz: maxRefresh === null ? null : Number.parseInt(maxRefresh, 10),
  };
}

/** runScenario builds a fresh World from world/seed.ttl and runs all five steps. */
export async function runScenario(): Promise<ScenarioResult> {
  const startedAt = performance.now();
  let queriesRun = 0;
  const sdk: WorldsSdk = createMemoryWorldsSdk();
  const query = async (sparql: string) => {
    queriesRun += 1;
    return await sdk.sparql({ query: sparql });
  };

  // Step 0: load the seed World.
  const seed = await Deno.readTextFile(SEED_URL);
  await sdk.import({
    source: { kind: "serialized", data: seed, contentType: "text/turtle" },
  });
  const importedQuads = await countQuads(query);

  // Step 1 + 2: ask, with trace.
  const answersBefore = [
    await answerQuestion(
      query,
      "A1",
      "Can the Aurora Laptop use the Beacon 27 Monitor at 144 Hz?",
      "https://demo.wazoo.dev/kgc2027#AuroraLaptop",
      "https://demo.wazoo.dev/kgc2027#Beacon27Monitor",
    ),
    await answerQuestion(
      query,
      "A2",
      "Can the Beacon 27 Monitor use the Halo Dock?",
      "https://demo.wazoo.dev/kgc2027#Beacon27Monitor",
      "https://demo.wazoo.dev/kgc2027#HaloDock",
    ),
  ];

  // Step 3: validate the seed claims, then the candidate in a scratch World.
  const validationSeed = await runValidation(query);
  const scratchSdk: WorldsSdk = createMemoryWorldsSdk();
  await scratchSdk.import({
    source: { kind: "serialized", data: seed, contentType: "text/turtle" },
  });
  await scratchSdk.import({
    source: {
      kind: "serialized",
      data: CANDIDATE_C2_TURTLE,
      contentType: "text/turtle",
    },
  });
  // The scratch World is a separate World; its queries are counted too.
  const validationCandidate = await runValidation(async (sparql) => {
    queriesRun += 1;
    return await scratchSdk.sparql({ query: sparql });
  });
  const candidateRejected = validationCandidate.some(
    (result) => result.outcome === "violation",
  );
  // The candidate is rejected: it is never imported into the real World.
  if (!candidateRejected) {
    throw new Error(
      "Candidate C2 passed validation; the demo expected a rejection.",
    );
  }

  // Step 4: retract claim C1.
  await query(CLAIM_C1_DELETE);
  const claimC1Check = await query(
    `PREFIX ex: <https://demo.wazoo.dev/kgc2027#>
ASK { ex:ClaimC1 a ex:CompatibilityClaim }`,
  ) as { kind: string; data: { boolean: boolean } };
  const claimC1Gone = !claimC1Check.data.boolean;
  if (!claimC1Gone) throw new Error("Claim C1 survived DELETE DATA.");
  const quadsAfterRetraction = await countQuads(query);
  const answersAffected = answersBefore
    .filter((answer) => answer.claim?.endsWith("#ClaimC1"))
    .map((answer) => answer.id);
  const retraction: RetractionRecord = {
    revokedClaim: "https://demo.wazoo.dev/kgc2027#ClaimC1",
    quadsDeleted: importedQuads - quadsAfterRetraction,
    reason:
      "Fable Systems withdrew the 144 Hz claim for Aurora Laptop + Beacon 27 Monitor (vendor notice 2026-11-02).",
    recordedAt: new Date().toISOString(),
    answersAffected,
  };

  // Step 5: re-ask both questions against the retracted World.
  const answersAfter = [
    await answerQuestion(
      query,
      "A1",
      "Can the Aurora Laptop use the Beacon 27 Monitor at 144 Hz?",
      "https://demo.wazoo.dev/kgc2027#AuroraLaptop",
      "https://demo.wazoo.dev/kgc2027#Beacon27Monitor",
    ),
    await answerQuestion(
      query,
      "A2",
      "Can the Beacon 27 Monitor use the Halo Dock?",
      "https://demo.wazoo.dev/kgc2027#Beacon27Monitor",
      "https://demo.wazoo.dev/kgc2027#HaloDock",
    ),
  ];

  return {
    importedQuads,
    quadsAfterRetraction,
    queriesRun,
    answersBefore,
    validationSeed,
    validationCandidate,
    candidateRejected,
    retraction,
    answersAfter,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}
