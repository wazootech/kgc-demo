/**
 * Validation checks for ex:CompatibilityClaim.
 *
 * Each check is a SPARQL ASK query: true means a violation exists.
 * These are SPARQL translations of rules V1–V4 in shapes/validation.ttl.
 * No SHACL engine ships in @worlds/sdk 0.9.0, @wazoo/sparql-engine 0.4.4, or
 * @wazoo/reasoner 0.4.0 (checked 2026-11-06), so the shape is the
 * specification and these ASK queries are what is actually executed.
 * See "What it does not do yet" in README.md for what this translation
 * cannot express.
 */
import type { WorldsSdk } from "@worlds/sdk";

export const EVALUATION_DATE = "2026-11-06";

export const TRUSTED_SOURCES = [
  "https://demo.wazoo.dev/kgc2027/sources/lab-test-2026-10-14",
  "https://demo.wazoo.dev/kgc2027/sources/vendor-spec-halo-2026-07",
  "https://demo.wazoo.dev/kgc2027/sources/support-kb-1042",
] as const;

export type CheckOutcome = "pass" | "violation" | "not-applicable";

export interface ValidationCheck {
  /** Check id, matching the rule numbers in shapes/validation.ttl. */
  id: string;
  /** Short name of the rule. */
  name: string;
  /** ASK query. True means a violation exists. */
  sparql: string;
}

export interface CheckResult extends ValidationCheck {
  outcome: CheckOutcome;
  detail: string;
}

const PREFIXES = `PREFIX ex: <https://demo.wazoo.dev/kgc2027#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

export const VALIDATION_CHECKS: ValidationCheck[] = [
  {
    id: "V1",
    name: "source must be trusted",
    sparql: `${PREFIXES}ASK {
  ?claim a ex:CompatibilityClaim ; dct:source ?source .
  FILTER (?source NOT IN (
    <https://demo.wazoo.dev/kgc2027/sources/lab-test-2026-10-14>,
    <https://demo.wazoo.dev/kgc2027/sources/vendor-spec-halo-2026-07>,
    <https://demo.wazoo.dev/kgc2027/sources/support-kb-1042>
  ))
}`,
  },
  {
    id: "V2",
    name: "validUntil must be present",
    sparql: `${PREFIXES}ASK {
  ?claim a ex:CompatibilityClaim .
  FILTER NOT EXISTS { ?claim ex:validUntil ?validUntil }
}`,
  },
  {
    id: "V3",
    name: "validUntil must not have passed",
    sparql: `${PREFIXES}ASK {
  ?claim a ex:CompatibilityClaim ; ex:validUntil ?validUntil .
  FILTER (?validUntil < "${EVALUATION_DATE}"^^xsd:date)
}`,
  },
  {
    id: "V4",
    name: "subject and object must be known products",
    sparql: `${PREFIXES}ASK {
  { ?claim a ex:CompatibilityClaim ; ex:subject ?subject .
    FILTER NOT EXISTS { ?subject a ex:Product } }
  UNION
  { ?claim a ex:CompatibilityClaim ; ex:object ?object .
    FILTER NOT EXISTS { ?object a ex:Product } }
}`,
  },
];

/**
 * runValidation executes every check in VALIDATION_CHECKS against a World.
 *
 * @param query A function that runs one SPARQL query and returns the raw
 * response. It is passed in so the caller can count queries.
 * @returns One result per check. V3 is "not-applicable" when V2 already
 * found a claim with no validUntil date, because there is no date to
 * compare; reporting that as a pass would be misleading.
 */
export async function runValidation(
  query: (sparql: string) => Promise<unknown>,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  let missingDate = false;
  for (const check of VALIDATION_CHECKS) {
    if (check.id === "V3" && missingDate) {
      results.push({
        ...check,
        outcome: "not-applicable",
        detail: "No validUntil date to compare; V2 already failed.",
      });
      continue;
    }
    const response = await query(check.sparql) as {
      kind: string;
      data: { boolean?: boolean };
    };
    if (response.kind !== "ask" || typeof response.data.boolean !== "boolean") {
      throw new Error(`Check ${check.id} did not return an ASK boolean.`);
    }
    const violation = response.data.boolean;
    if (check.id === "V2" && violation) missingDate = true;
    results.push({
      ...check,
      outcome: violation ? "violation" : "pass",
      detail: violation
        ? "At least one claim breaks this rule."
        : "No claim breaks this rule.",
    });
  }
  return results;
}

/** askBoolean runs one ASK query and returns its boolean. */
export async function askBoolean(
  sdk: WorldsSdk,
  sparql: string,
): Promise<boolean> {
  const response = await sdk.sparql({ query: sparql });
  if (response.kind !== "ask") {
    throw new Error("Expected an ASK response.");
  }
  return response.data.boolean;
}
