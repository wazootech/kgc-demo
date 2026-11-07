/**
 * writeRecords persists the two logs the demo produces, outside the World.
 *
 * - eval/answers.jsonl: every answer the demo gave, before and after
 *   retraction, one JSON object per line. This is how an earlier answer
 *   that used a revoked fact can be found afterwards.
 * - world/retractions.jsonl: the revocation record. The World itself
 *   keeps no tombstone; this file is the demo's own log, not a Worlds
 *   feature. Both files are overwritten on each run, so re-running the
 *   demo is idempotent.
 */
import type { ScenarioResult } from "./scenario.ts";

const ANSWERS_URL = new URL("../eval/answers.jsonl", import.meta.url);
const RETRACTIONS_URL = new URL("../world/retractions.jsonl", import.meta.url);

export async function writeRecords(result: ScenarioResult): Promise<void> {
  const answerLines = [
    ...result.answersBefore.map((answer) => ({
      when: "before-retraction",
      ...answer,
    })),
    ...result.answersAfter.map((answer) => ({
      when: "after-retraction",
      ...answer,
    })),
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  await Deno.writeTextFile(ANSWERS_URL, answerLines);
  await Deno.writeTextFile(
    RETRACTIONS_URL,
    JSON.stringify(result.retraction) + "\n",
  );
}
